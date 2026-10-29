// Actual candidate SQL, minimal fixture; no live writes or multi-connection claim.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PACK_CONFIG, RARITIES } from '../../js/packs/packConfig.js';
const { PGlite } = await import(process.env.TCG_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = id(1),
  other = id(2);
let checks = 0;
const same = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const refuses = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
  checks++;
};
const open = async (n, cards, p = profile) =>
  (await db.query('select tcg_private.open_pack($1,$2,$3) as r', [p, id(n), JSON.stringify(cards)]))
    .rows[0].r;
const packs = async () =>
  (
    await db.query('select packs::int as n from tcg_private.economy_accounts where profile_id=$1', [
      profile,
    ])
  ).rows[0].n;
const cards = [0, 1, 2, 3, 4].map((rarity_rank) => ({ card_id: 'fixture-card', rarity_rank }));
try {
  same(PACK_CONFIG.cardsPerPack, 5);
  same(PACK_CONFIG.guaranteedMinRarity, 'uncommon');
  same(RARITIES, ['common', 'uncommon', 'rare', 'legendary', 'pristine']);
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key); create table public.lobbies(id bigint primary key);
    insert into auth.users values('${id(101)}'),('${id(102)}'); insert into public.profiles values('${profile}'),('${other}');`);
  for (const file of [
    '001-foundation-candidate.sql',
    '002-reward-settlement-candidate.sql',
    '003-pack-opening-candidate.sql',
  ])
    await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
  // Owner-only test funding; service cannot mint packs or catalog entries.
  await db.exec(`insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${profile}','${id(101)}'),('${other}','${id(102)}');
    insert into tcg_private.economy_accounts(profile_id,packs) values('${profile}',3),('${other}',0);
    insert into tcg_private.pack_catalog values('fixture-card'),('fault-only-card'); set role service_role;`);
  for (const invalid of [
    null,
    {},
    [],
    cards.slice(1),
    [...cards, cards[0]],
    cards.map((c) => ({ ...c, rarity_rank: 0 })),
    cards.map((c) => ({ ...c, card_id: 'not-in-catalog' })),
    cards.map((c) => ({ ...c, rarity_rank: 5 })),
    cards.map((c) => ({ ...c, rarity_rank: '4' })),
    cards.map((c) => ({ ...c, rarity_rank: 1.5 })),
    cards.map(() => null),
  ]) {
    await refuses(
      () => open(10, invalid),
      /Expected five|Missing guaranteed|outside pack catalog|Invalid drawn/
    );
    same(await packs(), 3);
  }
  const first = await open(10, cards);
  same(first.cards, cards);
  same(await packs(), 2);
  same((await db.query('select rarity_rank from tcg_private.card_inventory')).rows, [
    { rarity_rank: 4 },
  ]);
  // Commit succeeded but response was lost; JSON-restored request identity returns same receipt.
  const restored = JSON.parse(JSON.stringify({ opening: 10 }));
  same(await open(restored.opening, null), first);
  same(await packs(), 2);
  // Retry cannot exchange committed contents for a newly rolled result.
  const lower = cards.map((c) => ({ ...c, rarity_rank: 1 }));
  same(await open(10, lower), first);
  await open(11, lower);
  same(await packs(), 1);
  same((await db.query('select rarity_rank from tcg_private.card_inventory')).rows, [
    { rarity_rank: 4 },
  ]);
  // Force a failure after debit/inventory operations. The transaction must undo all of them.
  await db.exec(`reset role; create function tcg_private.fail_pack() returns trigger language plpgsql as $$begin raise exception 'simulated pack receipt failure'; end;$$;
    create trigger fail_pack before insert on tcg_private.pack_receipts for each row execute function tcg_private.fail_pack(); set role service_role;`);
  await refuses(
    () =>
      open(
        12,
        cards.map((c) => ({ ...c, card_id: 'fault-only-card' }))
      ),
    /simulated pack receipt failure/
  );
  same(
    (
      await db.query(
        "select count(*)::int as n from tcg_private.card_inventory where card_id='fault-only-card'"
      )
    ).rows[0].n,
    0
  );
  same(await packs(), 1);
  same((await db.query('select count(*)::int as n from tcg_private.pack_receipts')).rows[0].n, 2);
  await db.exec(
    'reset role; drop trigger fail_pack on tcg_private.pack_receipts; set role service_role;'
  );
  const last = await open(12, cards);
  same(await packs(), 0);
  same(await open(12, lower), last); // Recovery still works at zero balance.
  await refuses(() => open(13, cards), /Insufficient packs/);
  await refuses(() => open(10, cards, other), /Insufficient packs/); // Another account cannot reuse receipt.
  for (const sql of [
    "insert into tcg_private.pack_catalog values('forged')",
    'update tcg_private.economy_accounts set packs=100',
    'delete from tcg_private.card_inventory',
    'update tcg_private.pack_receipts set packs_after=999',
  ])
    await refuses(() => db.exec(sql), /permission denied/);
  await db.exec('reset role;');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`grant usage on schema tcg_private to ${role}; set role ${role};`);
    await refuses(() => open(10, cards), /permission denied/);
    for (const table of ['pack_catalog', 'card_inventory', 'pack_receipts']) {
      await refuses(() => db.exec(`select * from tcg_private.${table}`), /permission denied/);
      await refuses(() => db.exec(`delete from tcg_private.${table}`), /permission denied/);
    }
    await db.exec('reset role;');
  }
  const rollback = await readFile(new URL('003-rollback-empty-packs.sql', import.meta.url), 'utf8');
  await refuses(() => db.exec(rollback), /Refusing pack rollback/);
  await db.exec('rollback;');
  same((await db.query('select count(*)::int as n from tcg_private.pack_receipts')).rows[0].n, 3);
  await db.exec('delete from tcg_private.pack_receipts; delete from tcg_private.card_inventory;');
  await db.exec(rollback);
  same((await db.query("select to_regclass('tcg_private.pack_receipts') as t")).rows[0].t, null);
  console.log(
    `PASS ${checks} pack SQL checks: atomic debit/delivery, durable retry, catalog/shape validation, no rarity downgrade, insufficient funds, role refusal and rollback preservation. Server RNG/ownership integration, live policies and parallel contention UNVERIFIED.`
  );
} finally {
  await db.close();
}
