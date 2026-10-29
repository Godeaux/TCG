// Local SQL/grant validation, NOT a live Supabase or authoritative-game certificate.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.TCG_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const schema = await readFile(new URL('./001-foundation-candidate.sql', import.meta.url), 'utf8');
const rollback = await readFile(new URL('./001-rollback-empty-staging.sql', import.meta.url), 'utf8');
try {
  // Minimal FK dependencies from live metadata, not a reconstructed live schema.
  await db.exec(`create role anon; create role authenticated;
    create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key);
    create table public.lobbies(id bigint primary key);
    insert into auth.users values ('00000000-0000-4000-8000-000000000001');
    insert into public.profiles values ('00000000-0000-4000-8000-000000000002');
    insert into public.lobbies values (1);`);
  await db.exec(schema);
  let refused = 0;
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['profile_owners', 'match_checkpoints', 'accepted_actions']) {
      await assert.rejects(db.query(`select * from tcg_private.${table}`), /permission denied/);
      await assert.rejects(db.query(`delete from tcg_private.${table}`), /permission denied/);
      refused += 2;
    }
    await db.exec('reset role');
  }
  await db.exec(`set role service_role;
    insert into tcg_private.profile_owners(profile_id,auth_user_id) values
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
    insert into tcg_private.match_checkpoints values
      ('00000000-0000-4000-8000-000000000003',1,1,1,'{}','{}','{}',now());
    insert into tcg_private.accepted_actions values
      ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',
       '00000000-0000-4000-8000-000000000001',1);`);
  await assert.rejects(db.exec(`insert into tcg_private.accepted_actions
    select * from tcg_private.accepted_actions`), /duplicate key/);
  await db.exec('reset role');
  await assert.rejects(db.exec(rollback), /Refusing rollback/);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int as n from tcg_private.profile_owners')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from tcg_private.match_checkpoints')).rows[0].n, 1);
  await db.exec(`delete from tcg_private.accepted_actions;
    delete from tcg_private.match_checkpoints; delete from tcg_private.profile_owners;`);
  await db.exec(rollback);
  assert.equal((await db.query("select count(*)::int as n from pg_namespace where nspname='tcg_private'")).rows[0].n, 0);
  console.log(`PASS: candidate applies; ${refused} browser-role reads/deletes refused; service writes succeed; duplicate action refused; populated rollback refuses and preserves rows; empty rollback succeeds.`);
} finally { await db.close(); }
