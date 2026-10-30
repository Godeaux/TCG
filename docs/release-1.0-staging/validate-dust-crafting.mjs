import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++};
const denies=async(f,re)=>{await assert.rejects(f,re);checks++};
const action=async(n,kind,card=null,rank=null)=>(await db.query('select public.tcg_dust_action($1,$2,$3,$4) r',[id(n),kind,card,rank])).rows[0].r;
const economy=async()=>(await db.query('select public.tcg_economy() r')).rows[0].r;
try {
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key);create table public.lobbies(id bigint primary key);
insert into auth.users values('${id(101)}'),('${id(102)}'),('${id(103)}');insert into public.profiles values('${id(1)}'),('${id(2)}');`);
for(const file of ['001-foundation-candidate.sql','002-reward-settlement-candidate.sql','003-pack-opening-candidate.sql','004-authenticated-packs.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
await db.exec(`insert into tcg_private.profile_owners values('${id(1)}','${id(101)}',now()),('${id(2)}','${id(102)}',now());
insert into tcg_private.economy_accounts(profile_id,packs) values('${id(1)}',4),('${id(2)}',0);
insert into tcg_private.pack_catalog values('card-a'),('card-b');`);
const cards=[0,0,1,1,2].map(r=>({card_id:'card-a',rarity_rank:r}));
await db.query('select tcg_private.open_pack($1,$2,$3)',[id(1),id(10),JSON.stringify(cards)]);
await db.exec(await readFile(new URL('009-dust-crafting.sql',import.meta.url),'utf8'));
await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(101)}'`);
same((await economy()).finishes.map(c=>c.quantity),[2,2,1]);
let result=await action(20,'recycle');same(result.receipt.dust_delta,5);same(result.economy.dust,5);same(result.economy.finishes.map(c=>c.quantity),[1,1,1]);
same((await action(20,'recycle')).receipt,result.receipt);
await denies(()=>action(20,'craft','card-b',0),/identity reused/);
result=await action(21,'craft','card-b',0);same(result.economy.dust,1);same(result.receipt.dust_delta,-4);
same((await action(21,'craft','card-b',0)).receipt,result.receipt);
await denies(()=>action(22,'craft','card-b',0),/already owned/);
await denies(()=>action(23,'craft','card-b',1),/Insufficient dust/);
await denies(()=>action(24,'craft','not-a-card',0),/Invalid craft/);
await denies(()=>action(25,'craft','card-b',5),/Invalid craft/);
await denies(()=>action(26,'recycle','card-b'),/Invalid dust/);
await denies(()=>db.query('select public.tcg_dust_action(null,\'recycle\')'),/Missing operation/);
same((await economy()).dust,1);
await denies(()=>db.exec('update tcg_private.card_finishes set quantity=999'),/permission denied/);
await denies(()=>db.exec('update tcg_private.economy_accounts set dust=999'),/permission denied/);
await denies(()=>db.exec('delete from tcg_private.dust_receipts'),/permission denied/);
await db.exec(`set request.jwt.claim.sub='${id(102)}'`);same((await economy()).finishes,[]);same((await action(21,'recycle')).economy.dust,0);
await denies(()=>action(30,'craft','card-a',0),/Insufficient dust/);
await db.exec(`set request.jwt.claim.sub='${id(103)}'`);await denies(()=>action(30,'recycle'),/Verified owner/);
await db.exec(`set request.jwt.claim.sub=''`);await denies(()=>action(30,'recycle'),/Authentication required/);
await db.exec('reset role;set role anon');await denies(()=>action(30,'recycle'),/permission denied/);
await db.exec('reset role');
// Existing pack path adds each copy exactly once, including receipt recovery.
await db.query('select tcg_private.open_pack($1,$2,$3)',[id(1),id(11),JSON.stringify(cards)]);
await db.query('select tcg_private.open_pack($1,$2,$3)',[id(1),id(11),JSON.stringify(cards)]);
await db.exec(`set role authenticated;set request.jwt.claim.sub='${id(101)}'`);
same((await economy()).finishes.filter(c=>c.card_id==='card-a').map(c=>c.quantity),[3,3,2]);
same((await action(31,'recycle')).receipt.dust_delta,26);
// All five prices, preserving higher owned finish when crafting lower.
await db.exec(`reset role;update tcg_private.economy_accounts set dust=2000 where profile_id='${id(1)}';set role authenticated`);
for(const rank of [4,3,2,1]){result=await action(40+rank,'craft','card-b',rank);same(result.receipt.dust_delta,-(4**(rank+1)));same(result.economy.inventory.find(c=>c.card_id==='card-b').rarity_rank,4);}
same(result.economy.dust,640);
// A failed receipt write rolls back ownership and debit.
await db.exec(`reset role;insert into tcg_private.pack_catalog values('card-c');
create function tcg_private.reject_receipt() returns trigger language plpgsql as $$begin raise exception 'injected storage failure';end;$$;
create trigger reject_receipt before insert on tcg_private.dust_receipts for each row execute function tcg_private.reject_receipt();set role authenticated`);
await denies(()=>action(99,'craft','card-c',0),/injected storage failure/);
same((await economy()).dust,640);same((await economy()).finishes.some(c=>c.card_id==='card-c'),false);
console.log(`PASS ${checks} dust SQL checks: migration, counted packs, retry identities, authorization, prices, keep-one recycling and atomic rollback. Multi-connection concurrency not certified by PGlite.`);
}finally{await db.close()}
