// Real local Postgres semantics via PGlite. NOT multi-connection/live Supabase certification.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.TCG_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a = id(2),
  b = id(3),
  match = id(10),
  rematch = id(11),
  failedMatch = id(12);
let checks = 0;
const same = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const refuses = async (sql, pattern = /permission denied/) => {
  await assert.rejects(db.exec(sql), pattern);
  checks++;
};
const settle = async (m, p) =>
  (await db.query('select tcg_private.settle_reward($1,$2) as receipt', [m, p])).rows[0].receipt;
const balance = async (p) =>
  (
    await db.query(
      'select packs::int,games_played::int,games_won::int from tcg_private.economy_accounts where profile_id=$1',
      [p]
    )
  ).rows[0];
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key); create table public.lobbies(id bigint primary key);
    insert into auth.users values('${id(100)}'),('${id(101)}');
    insert into public.profiles values('${a}'),('${b}'); insert into public.lobbies values(1);`);
  for (const file of ['001-foundation-candidate.sql', '002-reward-settlement-candidate.sql']) {
    await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
  }
  await db.exec(`set role service_role;
    insert into tcg_private.profile_owners(profile_id,auth_user_id) values('${a}','${id(100)}'),('${b}','${id(101)}');`);
  for (const [i, m] of [match, rematch, failedMatch].entries()) {
    await db.exec(`insert into tcg_private.match_checkpoints values('${m}',1,${i + 1},1,'{}','{}','{}',now());
      insert into tcg_private.accepted_actions values('${m}','${id(20 + i)}','${id(100)}',1);
      insert into tcg_private.match_seats values('${m}',0,'${a}'),('${m}',1,'${b}');`);
  }
  await db.exec(`insert into tcg_private.reward_results(match_id,profile_id,final_revision,won,eligible,policy_version)
    values('${match}','${a}',1,true,true,'test-v1'),('${match}','${b}',1,false,true,'test-v1'),
    ('${rematch}','${a}',1,false,false,'test-v1'),('${failedMatch}','${a}',1,true,true,'test-v1');`);
  await refuses(
    `insert into tcg_private.reward_results values('${match}','${a}',1,false,true,'changed',now())`,
    /duplicate key/
  );
  await refuses(`update tcg_private.reward_results set eligible=true`);
  await refuses(`delete from tcg_private.match_seats`);
  await refuses(`insert into tcg_private.economy_accounts(profile_id,packs) values('${a}',999)`);
  await refuses(
    `insert into tcg_private.reward_results values('${rematch}','${b}',999,false,true,'test-v1',now())`,
    /foreign key/
  );
  await assert.rejects(settle(id(99), a), /No validated reward result/);
  checks++;
  const first = await settle(match, a);
  same(first.packs_awarded, 1);
  same(await balance(a), { packs: 1, games_played: 1, games_won: 1 });
  // Acknowledgement lost: retry the committed operation, preserving receipt identity.
  same(await settle(match, a), first);
  // Queued requests on one embedded connection; does NOT prove parallel lock contention.
  for (const receipt of await Promise.all(Array.from({ length: 20 }, () => settle(match, a))))
    same(receipt, first);
  same(await balance(a), { packs: 1, games_played: 1, games_won: 1 });
  same((await settle(match, b)).packs_awarded, 1);
  same(await balance(b), { packs: 1, games_played: 1, games_won: 0 });
  // Same lobby, fresh match ID: zero-reward policy result still records exactly one game.
  same((await settle(rematch, a)).packs_awarded, 0);
  same(await balance(a), { packs: 1, games_played: 2, games_won: 1 });
  same(await settle(match, a), first); // Historical receipt must not change after later games.
  await refuses(`update tcg_private.reward_receipts set packs_awarded=1`);
  await refuses(`delete from tcg_private.reward_receipts`);
  await db.exec(`reset role;
    create function tcg_private.fail_receipt() returns trigger language plpgsql as $$begin raise exception 'simulated durable receipt failure'; end;$$;
    create trigger fail_receipt before insert on tcg_private.reward_receipts for each row execute function tcg_private.fail_receipt();
    set role service_role;`);
  await assert.rejects(settle(failedMatch, a), /simulated durable receipt failure/);
  checks++;
  same(await balance(a), { packs: 1, games_played: 2, games_won: 1 });
  same(
    (
      await db.query(
        'select count(*)::int as n from tcg_private.reward_receipts where match_id=$1',
        [failedMatch]
      )
    ).rows[0].n,
    0
  );
  await db.exec(
    'reset role; drop trigger fail_receipt on tcg_private.reward_receipts; set role service_role;'
  );
  same((await settle(failedMatch, a)).packs_awarded, 1);
  same(await balance(a), { packs: 2, games_played: 3, games_won: 2 });
  await db.exec('reset role;');
  for (const role of ['anon', 'authenticated']) {
    // Even if a future schema grant is broader, table and function ACLs must hold.
    await db.exec(`grant usage on schema tcg_private to ${role}; set role ${role};`);
    for (const table of ['match_seats', 'reward_results', 'economy_accounts', 'reward_receipts']) {
      await refuses(`select * from tcg_private.${table}`);
      await refuses(`delete from tcg_private.${table}`);
    }
    await refuses(`select tcg_private.settle_reward('${match}','${a}')`);
    await refuses(`insert into tcg_private.economy_accounts(profile_id,packs) values('${a}',999)`);
    await db.exec('reset role;');
  }
  const rollback = await readFile(
    new URL('002-rollback-empty-rewards.sql', import.meta.url),
    'utf8'
  );
  await assert.rejects(db.exec(rollback), /Refusing reward rollback/);
  checks++;
  await db.exec('rollback');
  same(await balance(a), { packs: 2, games_played: 3, games_won: 2 });
  // Test-only fixture teardown as the database owner; never a production cleanup.
  await db.exec(
    'delete from tcg_private.reward_receipts; delete from tcg_private.economy_accounts; delete from tcg_private.reward_results; delete from tcg_private.match_seats;'
  );
  await db.exec(rollback);
  same((await db.query("select to_regclass('tcg_private.reward_receipts') as t")).rows[0].t, null);
  console.log(
    `PASS ${checks} checks: immutable result/receipt ACLs, exact-once retry, separate seats/rematches, no-result refusal, transactional rollback, browser-role refusal. Multi-connection contention, validated service integration and legacy-policy cutover remain UNVERIFIED.`
  );
} finally {
  await db.close();
}
