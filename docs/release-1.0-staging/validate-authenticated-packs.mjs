import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { RARITY_WEIGHTS } from '../../js/packs/packConfig.js';
const { PGlite } = await import(process.env.TCG_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denies=async(fn,re)=>{await assert.rejects(fn,re);checks++;};
const rpc=async(n)=> (await db.query('select public.tcg_open_pack($1) r',[id(n)])).rows[0].r;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create table public.profiles(id uuid primary key); create table public.lobbies(id bigint primary key);
    insert into auth.users values('${id(101)}'),('${id(102)}'),('${id(103)}');
    insert into public.profiles values('${id(1)}'),('${id(2)}');`);
  for(const f of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','003-pack-opening-candidate.sql','004-authenticated-packs.sql'])
    await db.exec(await readFile(new URL(f,import.meta.url),'utf8'));
  same(Object.values(RARITY_WEIGHTS),[83.99,10,5,1,0.01]);
  await db.exec(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${id(1)}','${id(101)}'),('${id(2)}','${id(102)}');
    insert into tcg_private.economy_accounts(profile_id,packs) values('${id(1)}',2),('${id(2)}',0);
    insert into tcg_private.pack_catalog values('card-a'),('card-b'); set role authenticated;`);
  await denies(()=>rpc(10),/Authentication required/);
  await db.exec(`set request.jwt.claim.sub='${id(103)}'`);
  same((await db.query('select public.tcg_economy() r')).rows[0].r,null);
  await denies(()=>rpc(10),/Verified owner required/);
  await db.exec(`set request.jwt.claim.sub='${id(101)}'`);
  await denies(()=>db.query('select public.tcg_open_pack(null)'),/Missing opening/);
  const first=await rpc(10);
  same(first.economy.packs,1);
  same(first.receipt.cards.length,5);
  same(first.receipt.profile_id,id(1));
  same(first.receipt.cards.every(c=>['card-a','card-b'].includes(c.card_id)&&Number.isInteger(c.rarity_rank)&&c.rarity_rank>=0&&c.rarity_rank<=4),true);
  same(first.receipt.cards.some(c=>c.rarity_rank>=1),true);
  const second=await rpc(11);
  same(second.economy.packs,0);
  const retry=await rpc(10);
  same(retry.receipt,first.receipt);
  same(retry.economy.packs,0); // NOT the receipt's historical balance of 1.
  same((await rpc(11)).receipt,second.receipt);
  await denies(()=>rpc(12),/Insufficient packs/);
  await db.exec(`set request.jwt.claim.sub='${id(102)}'`);
  await denies(()=>rpc(10),/Insufficient packs/);
  same((await db.query('select public.tcg_economy() r')).rows[0].r.inventory,[]);
  await denies(()=>db.query('select tcg_private.random_below(10)'),/permission denied/);
  await denies(()=>db.query('update tcg_private.economy_accounts set packs=99'),/permission denied/);
  await db.exec('reset role; set role anon;');
  await denies(()=>rpc(10),/permission denied/);
  await denies(()=>db.query('select public.tcg_economy()'),/permission denied/);
  await db.exec('reset role;');
  same((await db.query('select count(*)::int n from tcg_private.pack_receipts')).rows[0].n,2);
  // Empty catalog fails atomically; existing receipt recovery must remain available.
  await db.exec(`update tcg_private.economy_accounts set packs=1 where profile_id='${id(2)}';
    alter table tcg_private.card_inventory drop constraint card_inventory_card_id_fkey;
    delete from tcg_private.pack_catalog; set role authenticated;`);
  await denies(()=>rpc(20),/Pack catalog unavailable/);
  same((await db.query('select public.tcg_economy() r')).rows[0].r.packs,1);
  await db.exec(`set request.jwt.claim.sub='${id(101)}'`);
  same((await rpc(10)).receipt,first.receipt);
  // Exercise the deployed rarity thresholds with deterministic RNG IO only.
  await db.exec(`reset role; insert into tcg_private.pack_catalog values('card-a');
    update tcg_private.economy_accounts set packs=20 where profile_id='${id(1)}';`);
  for (const [roll,rank] of [[0,0],[8398,0],[8399,1],[9398,1],[9399,2],[9898,2],[9899,3],[9998,3],[9999,4]]) {
    await db.exec(`create or replace function tcg_private.random_below(bound integer) returns integer
      language plpgsql volatile set search_path='' as $$begin return case when bound=10000 then ${roll} else 0 end; end;$$;
      set role authenticated;`);
    const pack=await rpc(100+roll);
    same(pack.receipt.cards.slice(0,4).map(c=>c.rarity_rank),[rank,rank,rank,rank]);
    same(pack.receipt.cards[4].rarity_rank,Math.max(rank,1));
    await db.exec('reset role;');
  }
  console.log(`PASS ${checks} authenticated pack SQL checks (real migration): identity isolation, no client draws, retries at zero, current balance, empty-catalog refusal. No multi-connection claim.`);
} finally { await db.close(); }
