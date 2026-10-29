-- Applied as additive private infrastructure 2026-10-29; client cutover pending.
-- No existing profiles are reassigned. No legacy policies are changed here.
-- This is infrastructure, not an authorization/game-validation implementation.
begin;
create schema tcg_private;
revoke all on schema tcg_private from public, anon, authenticated;
grant usage on schema tcg_private to service_role;

create table tcg_private.profile_owners (
  profile_id uuid primary key references public.profiles(id),
  auth_user_id uuid not null unique references auth.users(id),
  verified_at timestamptz not null default now()
);
-- Only trusted, independently verified mappings may be inserted by the service.
-- Never INSERT ... SELECT profiles.current_auth_id to populate this table.

create table tcg_private.match_checkpoints (
  match_id uuid primary key,
  lobby_id bigint not null references public.lobbies(id),
  generation bigint not null check (generation >= 1),
  revision bigint not null check (revision >= 0),
  canonical_state jsonb not null,
  seat_zero_view jsonb not null,
  seat_one_view jsonb not null,
  updated_at timestamptz not null default now(),
  unique (lobby_id, generation)
);
create table tcg_private.accepted_actions (
  match_id uuid not null references tcg_private.match_checkpoints(match_id),
  action_id uuid not null,
  actor_auth_id uuid not null references auth.users(id),
  accepted_revision bigint not null check (accepted_revision >= 1),
  primary key (match_id, action_id),
  unique (match_id, accepted_revision)
);
-- RLS with no browser policies: only service_role may use these tables.
alter table tcg_private.profile_owners enable row level security;
alter table tcg_private.match_checkpoints enable row level security;
alter table tcg_private.accepted_actions enable row level security;
revoke all on all tables in schema tcg_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema tcg_private to service_role;
commit;
