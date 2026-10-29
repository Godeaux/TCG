-- Applied 2026-10-29; requires001. Does not secure legacy public economy writes.
-- Trusted service MUST validate gameplay and permanent ownership before recording
-- seats/results. No browser may choose winners, eligibility, balances or rewards.
begin;
create table tcg_private.match_seats (
  match_id uuid not null references tcg_private.match_checkpoints(match_id),
  seat smallint not null check (seat in (0,1)),
  profile_id uuid references tcg_private.profile_owners(profile_id),
  primary key(match_id,seat),
  unique(match_id,profile_id)
);
-- A fresh match_id is required for each rematch, even in the same lobby.
create table tcg_private.reward_results (
  match_id uuid not null,
  profile_id uuid not null,
  final_revision bigint not null,
  won boolean not null,
  eligible boolean not null,
  policy_version text not null check (length(policy_version) between 1 and 80),
  recorded_at timestamptz not null default now(),
  primary key(match_id,profile_id),
  foreign key(match_id,profile_id) references tcg_private.match_seats(match_id,profile_id),
  foreign key(match_id,final_revision) references tcg_private.accepted_actions(match_id,accepted_revision)
);
create table tcg_private.economy_accounts (
  profile_id uuid primary key references tcg_private.profile_owners(profile_id),
  packs bigint not null default 0 check(packs >=0),
  games_played bigint not null default 0 check(games_played >=0),
  games_won bigint not null default 0 check(games_won >=0 and games_won <=games_played)
);
create table tcg_private.reward_receipts (
  receipt_id uuid not null unique default gen_random_uuid(),
  match_id uuid not null,
  profile_id uuid not null,
  packs_awarded smallint not null check(packs_awarded in(0,1)),
  packs_after bigint not null check(packs_after >=0),
  games_played_after bigint not null,
  games_won_after bigint not null,
  settled_at timestamptz not null default now(),
  primary key(match_id,profile_id),
  foreign key(match_id,profile_id) references tcg_private.reward_results(match_id,profile_id)
);
alter table tcg_private.match_seats enable row level security;
alter table tcg_private.reward_results enable row level security;
alter table tcg_private.economy_accounts enable row level security;
alter table tcg_private.reward_receipts enable row level security;
-- Explicit grants, including service_role: BYPASSRLS does not bypass table ACLs.
revoke all on tcg_private.match_seats,tcg_private.reward_results,
 tcg_private.economy_accounts,tcg_private.reward_receipts from public,anon,authenticated,service_role;
grant select,insert on tcg_private.match_seats,tcg_private.reward_results to service_role;
grant select on tcg_private.economy_accounts,tcg_private.reward_receipts to service_role;

-- Safe retry returns an immutable receipt, NOT an invitation to award again.
-- Receipt balances are historical; fetch the account separately for current balance.
create function tcg_private.settle_reward(p_match uuid,p_profile uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result tcg_private.reward_results%rowtype;
  account tcg_private.economy_accounts%rowtype;
  receipt tcg_private.reward_receipts%rowtype;
  award smallint;
begin
  select * into result from tcg_private.reward_results
    where match_id=p_match and profile_id=p_profile;
  if not found then raise exception 'No validated reward result' using errcode='22023'; end if;
  insert into tcg_private.economy_accounts(profile_id) values(p_profile)
    on conflict(profile_id) do nothing;
  -- Serialize ALL settlement writes for an account, including different matches.
  select * into account from tcg_private.economy_accounts
    where profile_id=p_profile for update;
  select * into receipt from tcg_private.reward_receipts
    where match_id=p_match and profile_id=p_profile;
  if found then return to_jsonb(receipt); end if;
  award := case when result.eligible then 1 else 0 end;
  update tcg_private.economy_accounts set
    packs=packs+award,
    games_played=games_played+1,
    games_won=games_won+case when result.won then 1 else 0 end
    where profile_id=p_profile returning * into account;
  insert into tcg_private.reward_receipts(match_id,profile_id,packs_awarded,packs_after,
    games_played_after,games_won_after)
    values(p_match,p_profile,award,account.packs,account.games_played,account.games_won)
    returning * into receipt;
  return to_jsonb(receipt);
end;
$$;
revoke all on function tcg_private.settle_reward(uuid,uuid) from public,anon,authenticated;
grant execute on function tcg_private.settle_reward(uuid,uuid) to service_role;
commit;
