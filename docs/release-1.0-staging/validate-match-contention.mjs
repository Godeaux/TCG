// Opt-in, isolated local PostgreSQL only; never point at a player database.
// TCG_PG_MODULE=/absolute/path/to/pg/lib/index.js TCG_MATCH_QA_PORT=55439 node this-file
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { default: pg } = await import(process.env.TCG_PG_MODULE || 'pg');
const config={host:'127.0.0.1',port:Number(process.env.TCG_MATCH_QA_PORT||55439),user:'tcg_qa',database:'tcg_atomic_qa',query_timeout:10000};
const connections=[new pg.Client(config),new pg.Client(config),new pg.Client(config)];
const [a,b,observer]=connections;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql='select tcg_private.commit_match_action($1,$2,$3,$4,$5,$6,$7,$8,$9) r';
const args=(action,revision,finished=false)=>[id(1),id(action),id(101),revision,{type:'END_TURN'}, {turn:revision+2},{seat:0},{seat:1},finished];
let observedLocks=0;
const waitForLock=async(pid)=>{
 for(let i=0;i<40;i++) {
  const r=await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[pid]);
  if(r.rows[0]?.wait_event_type==='Lock'){observedLocks++;return;}
  await new Promise(r=>setTimeout(r,25));
 }
 throw new Error('Did not observe the contender blocked on a database lock');
};
try {
 await Promise.all(connections.map(c=>c.connect()));
 assert.equal((await observer.query("select count(*)::int n from pg_namespace where nspname='tcg_private'")).rows[0].n,0,'Requires a fresh isolated database');
 await observer.query(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key); create table public.profiles(id uuid primary key); create table public.lobbies(id bigint primary key);
  insert into auth.users values('${id(101)}'); insert into public.profiles values('${id(201)}'); insert into public.lobbies values(1);`);
 for(const file of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','007-append-only-evidence.sql','008-atomic-match-commit.sql'])
  await observer.query(await readFile(new URL(file,import.meta.url),'utf8'));
 await observer.query(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${id(201)}','${id(101)}');
  insert into tcg_private.match_checkpoints(match_id,lobby_id,generation,revision,canonical_state,seat_zero_view,seat_one_view) values('${id(1)}',1,1,0,'{}','{}','{}');
  insert into tcg_private.match_seats values('${id(1)}',0,'${id(201)}');`);
 const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid;
 const pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
 assert.notEqual(pidA,pidB);
 // Two distinct actions compete for the same revision. One must lose without mutation.
 await a.query('begin; set local role service_role');
 const first=(await a.query(sql,args(10,0))).rows[0].r;
 await b.query('begin; set local role service_role');
 const contender=b.query(sql,args(11,0)).then(r=>({r}),error=>({code:error.code}));
 await waitForLock(pidB);
 await a.query('commit');
 assert.deepEqual(await contender,{code:'40001'});
 await b.query('rollback');
 // Two callers retry the same accepted action; both receive the same receipt.
 await a.query('begin; set local role service_role');
 assert.deepEqual((await a.query(sql,args(10,0))).rows[0].r,first);
 await b.query('begin; set local role service_role');
 const duplicate=b.query(sql,args(10,0));
 await waitForLock(pidB);
 await a.query('commit');
 assert.deepEqual((await duplicate).rows[0].r,first);
 await b.query('commit');
 // Lost terminal acknowledgment recovers on a fresh connection after the writer exits.
 await a.query('begin; set local role service_role');
 const terminal=(await a.query(sql,args(12,1,true))).rows[0].r;
 await a.query('commit');
 await a.end();
 const fresh=new pg.Client(config);
 try {
  await fresh.connect(); await fresh.query('set role service_role');
  assert.deepEqual((await fresh.query(sql,args(12,1,true))).rows[0].r,terminal);
 } finally {await fresh.end();}
 const state=(await observer.query('select revision,finished,canonical_state from tcg_private.match_checkpoints')).rows[0];
 assert.deepEqual(state,{revision:'2',finished:true,canonical_state:{turn:3}});
 assert.equal((await observer.query('select count(*)::int n from tcg_private.accepted_actions')).rows[0].n,2);
 console.log(JSON.stringify({result:'PASS',postgres:(await observer.query('show server_version')).rows[0].server_version,independentConnections:true,observedLockWaits:observedLocks,staleContender:'40001',acceptedActions:2,terminalRevision:2,freshConnectionRetry:true,scope:'Local PostgreSQL, production SQL. Not a live gameplay test.'}));
} finally {
 // Release locks even on failed assertions, so no hidden pending query survives.
 await Promise.allSettled(connections.map(c=>c.query('rollback')));
 await Promise.allSettled(connections.map(c=>c.end()));
}
