import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.TCG_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denies=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const commit=async(action=10,rev=0,actor=101,body={type:'END_TURN'},next={turn:2},finished=false,match=1)=>
  (await db.query('select tcg_private.commit_match_action($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
    [id(match),id(action),id(actor),rev,body,next,{seat:0},{seat:1},finished])).rows[0].r;
const snapshot=async()=> (await db.query('select revision,canonical_state,seat_zero_view,seat_one_view,finished from tcg_private.match_checkpoints where match_id=$1',[id(1)])).rows[0];
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key); create table public.lobbies(id bigint primary key);
    insert into auth.users values('${id(101)}'),('${id(102)}'),('${id(103)}');
    insert into public.profiles values('${id(201)}'),('${id(202)}'); insert into public.lobbies values(1);`);
  for(const f of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','007-append-only-evidence.sql','008-atomic-match-commit.sql'])
    await db.exec(await readFile(new URL(f,import.meta.url),'utf8'));
  await db.exec(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${id(201)}','${id(101)}'),('${id(202)}','${id(102)}');
    insert into tcg_private.match_checkpoints(match_id,lobby_id,generation,revision,canonical_state,seat_zero_view,seat_one_view)
      values('${id(1)}',1,1,0,'{"turn":1}','{}','{}'),('${id(2)}',1,2,0,'{}','{}','{}');
    insert into tcg_private.match_seats values('${id(1)}',0,'${id(201)}'),('${id(1)}',1,'${id(202)}'),('${id(2)}',0,'${id(201)}');`);
  const before=await snapshot();
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await denies(()=>commit(),/permission denied/);
    await denies(()=>snapshot(),/permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await denies(()=>commit(10,0,103),/not a verified match participant/);
  await denies(()=>commit(10,0,101,{}, {},false,999),/Unknown match/);
  await denies(()=>commit(10,-1),/Invalid action request/);
  await denies(()=>commit(10,0,101,null),/Invalid action request/);
  await denies(()=>commit(10,0,101,{text:'x'.repeat(65537)}),/Invalid action request/);
  await denies(()=>commit(10,0,101,{},[]),/Invalid next-state/);
  await denies(()=>commit(10,0,101,{},null),/Invalid next-state/);
  await denies(()=>commit(10,0,101,{}, {text:'x'.repeat(2097153)}),/Invalid next-state/);
  same(await snapshot(),before);
  const first=await commit();
  same(first,{match_id:id(1),action_id:id(10),accepted_revision:1});
  const after=await snapshot();
  same(after,{revision:1,canonical_state:{turn:2},seat_zero_view:{seat:0},seat_one_view:{seat:1},finished:false});
  same(await commit(10,0,101,{type:'END_TURN'},{turn:999}),first);
  same(await snapshot(),after); // Retries cannot overwrite committed output.
  await denies(()=>commit(10,0,102),/different request/);
  await denies(()=>commit(10,1),/different request/);
  await denies(()=>commit(10,0,101,{type:'DRAW_CARD'}),/different request/);
  await denies(()=>commit(11,0),/Stale match revision/);
  await denies(()=>commit(11,3),/Stale match revision/);
  same(await snapshot(),after);
  // Both checkpoint and receipt roll back if receipt persistence fails late.
  await db.exec(`reset role; create function tcg_private.qa_refuse() returns trigger language plpgsql as $$begin raise exception 'QA receipt failure'; end;$$;
    create trigger qa_refuse before insert on tcg_private.accepted_actions for each row execute function tcg_private.qa_refuse(); set role service_role;`);
  await denies(()=>commit(11,1),/QA receipt failure/);
  same(await snapshot(),after);
  await db.exec('reset role; drop trigger qa_refuse on tcg_private.accepted_actions; drop function tcg_private.qa_refuse(); set role service_role;');
  const terminal=await commit(11,1,102,{type:'END_TURN'},{turn:3},true);
  same(terminal.accepted_revision,2);
  same(await commit(10),first); // Old response loss recovers after later terminal action.
  same(await commit(11,1,102,{type:'END_TURN'},null,true),terminal);
  await denies(()=>commit(12,2),/Match already finished/);
  same((await snapshot()).canonical_state,{turn:3});
  same((await snapshot()).finished,true);
  same((await commit(10,0,101,{}, {},false,2)).accepted_revision,1); // Rematch identity is distinct.
  for(const sql of ['update tcg_private.match_checkpoints set revision=99','delete from tcg_private.match_checkpoints','truncate tcg_private.match_checkpoints',
    `insert into tcg_private.accepted_actions(match_id,action_id,actor_auth_id,accepted_revision) values('${id(1)}','${id(12)}','${id(101)}',3)`,
    'update tcg_private.accepted_actions set request_hash=null','delete from tcg_private.accepted_actions','truncate tcg_private.accepted_actions'])
    await denies(()=>db.exec(sql),/permission denied/);
  same((await db.query('select count(*)::int n from tcg_private.accepted_actions')).rows[0].n,3);
  console.log(`PASS ${checks} match commit SQL checks: stale/foreign/browser refusal, immutable request identities, retry-after-finish, rematch separation, atomic rollback and direct-write denial. Trusted gameplay legality, private projections and multi-connection races are NOT certified by this single-connection test.`);
} finally { await db.close(); }
