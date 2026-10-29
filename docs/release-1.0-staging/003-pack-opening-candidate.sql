-- Applied 2026-10-29. Requires001+002; does not alter legacy economy permissions.
-- Only the trusted service may supply server-generated draws. Never forward
-- browser-selected cards/rarities. Authenticate permanent ownership upstream.
begin;
create table tcg_private.pack_catalog (
  card_id text primary key check(length(card_id) between 1 and 160)
);
-- Seed only reviewed non-token IDs during deployment; service cannot edit catalog.
create table tcg_private.card_inventory (
  profile_id uuid not null references tcg_private.profile_owners(profile_id),
  card_id text not null references tcg_private.pack_catalog(card_id),
  rarity_rank smallint not null check(rarity_rank between 0 and 4),
  primary key(profile_id,card_id)
);
create table tcg_private.pack_receipts (
  profile_id uuid not null references tcg_private.profile_owners(profile_id),
  opening_id uuid not null,
  cards jsonb not null check(jsonb_typeof(cards)='array' and jsonb_array_length(cards)=5),
  packs_after bigint not null check(packs_after>=0),
  opened_at timestamptz not null default now(),
  primary key(profile_id,opening_id)
);
alter table tcg_private.pack_catalog enable row level security;
alter table tcg_private.card_inventory enable row level security;
alter table tcg_private.pack_receipts enable row level security;
revoke all on tcg_private.pack_catalog,tcg_private.card_inventory,tcg_private.pack_receipts
 from public,anon,authenticated,service_role;
grant select on tcg_private.pack_catalog,tcg_private.card_inventory,tcg_private.pack_receipts to service_role;

create function tcg_private.open_pack(p_profile uuid,p_opening uuid,p_cards jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  receipt tcg_private.pack_receipts%rowtype;
  account tcg_private.economy_accounts%rowtype;
  card jsonb;
  rank_value integer;
  best_rank integer := -1;
begin
  if p_opening is null then raise exception 'Missing opening identity' using errcode='22023'; end if;
  -- Same account lock as reward settlement: no stale absolute balance writes.
  select * into account from tcg_private.economy_accounts where profile_id=p_profile for update;
  if not found then raise exception 'No economy account' using errcode='22023'; end if;
  select * into receipt from tcg_private.pack_receipts where profile_id=p_profile and opening_id=p_opening;
  if found then return to_jsonb(receipt); end if;
  if account.packs<1 then raise exception 'Insufficient packs' using errcode='22023'; end if;
  if p_cards is null or jsonb_typeof(p_cards)<>'array' then
    raise exception 'Expected five server-drawn cards' using errcode='22023';
  end if;
  if jsonb_array_length(p_cards)<>5 then
    raise exception 'Expected five server-drawn cards' using errcode='22023';
  end if;
  for card in select value from jsonb_array_elements(p_cards) loop
    if jsonb_typeof(card)<>'object' or jsonb_typeof(card->'card_id') is distinct from 'string'
      or jsonb_typeof(card->'rarity_rank') is distinct from 'number'
      or (card->>'rarity_rank') !~ '^[0-4]$' then
      raise exception 'Invalid drawn card' using errcode='22023';
    end if;
    if not exists(select 1 from tcg_private.pack_catalog where card_id=card->>'card_id') then
      raise exception 'Card outside pack catalog' using errcode='22023';
    end if;
    rank_value := (card->>'rarity_rank')::integer;
    best_rank := greatest(best_rank,rank_value);
  end loop;
  if best_rank<1 then raise exception 'Missing guaranteed uncommon' using errcode='22023'; end if;
  update tcg_private.economy_accounts set packs=packs-1 where profile_id=p_profile returning * into account;
  -- Multiple copies in one pack are valid; never overwrite a better owned rarity.
  for card in select value from jsonb_array_elements(p_cards) loop
    insert into tcg_private.card_inventory(profile_id,card_id,rarity_rank)
      values(p_profile,card->>'card_id',(card->>'rarity_rank')::smallint)
      on conflict(profile_id,card_id) do update
      set rarity_rank=greatest(tcg_private.card_inventory.rarity_rank,excluded.rarity_rank);
  end loop;
  insert into tcg_private.pack_receipts(profile_id,opening_id,cards,packs_after)
    values(p_profile,p_opening,p_cards,account.packs) returning * into receipt;
  return to_jsonb(receipt);
end;
$$;
revoke all on function tcg_private.open_pack(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function tcg_private.open_pack(uuid,uuid,jsonb) to service_role;
commit;
