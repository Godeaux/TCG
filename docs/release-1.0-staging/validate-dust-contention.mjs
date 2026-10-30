// Opt-in isolated local PostgreSQL. Requires a fresh database, never a player DB.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {default:pg}=await import(process.env.TCG_PG_MODULE||'pg');
const config={host:'127.0.0.1',port:55440,user:'tcg_qa',database:'postgres',query_timeout:10000};
const clients=[new pg.Client(config),new pg.Client(config),new pg.Client(config)];
const [a,b,o]=clients,id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql='select public.tcg_dust_action($1,$2,$3,$4) r';
const craft=n=>[id(n),'craft','fish',1],recycle=n=>[id(n),'recycle',null,null];
let locks=0;
const lock=async()=>{for(let i=0;i<60;i++){const r=await o.query('select wait_event_type from pg_stat_activity where pid=$1',[b.processID]);if(r.rows[0]?.wait_event_type==='Lock'){locks++;return}await new Promise(r=>setTimeout(r,25))}throw Error('No observed lock contention')};
try{
 await Promise.all(clients.map(c=>c.connect()));
 assert.equal((await o.query("select count(*)::int n from pg_namespace where nspname='tcg_private'")).rows[0].n,0);
 await o.query(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table public.profiles(id uuid primary key);create table public.lobbies(id bigint primary key);insert into auth.users values('${id(101)}');insert into public.profiles values('${id(1)}');`);
 for(const f of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','003-pack-opening-candidate.sql','004-authenticated-packs.sql','009-dust-crafting.sql'])await o.query(await readFile(new URL(f,import.meta.url),'utf8'));
 await o.query(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${id(1)}','${id(101)}');insert into tcg_private.economy_accounts(profile_id,packs,dust) values('${id(1)}',1,16);insert into tcg_private.pack_catalog values('fish');`);
 for(const c of [a,b])await c.query(`set role authenticated;set request.jwt.claim.sub='${id(101)}'`);
 await a.query('begin');const first=(await a.query(sql,craft(10))).rows[0].r;
 const competing=b.query(sql,craft(11)).then(r=>({r}),e=>({error:e.message}));await lock();await a.query('commit');assert.match((await competing).error,/already owned/);
 // Same intent concurrently: exactly the original receipt, even at zero dust.
 await a.query('begin');await a.query(sql,craft(10));const retry=b.query(sql,craft(10));await lock();await a.query('commit');assert.deepEqual((await retry).rows[0].r.receipt,first.receipt);
 // Pack receipt counting and recycler take the same account lock.
 await a.query('begin');await a.query('select public.tcg_open_pack($1)',[id(20)]);
 const recycled=b.query(sql,recycle(21));await lock();await a.query('commit');const r=(await recycled).rows[0].r;
 assert(r.receipt.dust_delta>0);assert(r.economy.finishes.every(f=>f.quantity===1));
 await a.end();const fresh=new pg.Client(config);try{await fresh.connect();await fresh.query(`set role authenticated;set request.jwt.claim.sub='${id(101)}'`);assert.deepEqual((await fresh.query(sql,recycle(21))).rows[0].r.receipt,r.receipt)}finally{await fresh.end()}
 assert.equal((await o.query('select count(*)::int n from tcg_private.dust_receipts')).rows[0].n,2);
 console.log(JSON.stringify({result:'PASS',independentConnections:true,observedLockWaits:locks,competingCraft:'refused',duplicateCraft:'same receipt',packVsRecycle:'serialized',freshConnectionRecovery:true}));
}finally{await Promise.allSettled(clients.map(c=>c.query('rollback')));await Promise.allSettled(clients.map(c=>c.end()))}
