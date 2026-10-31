-- Owner-approved scope: retain host/browser-run gameplay, not anti-cheat authority.
-- Accept existing match outcomes; centralize accounting and deduplicate retries.
-- Deliberately separate from server-validated reward_results/reward_receipts.
begin;
create table tcg_private.host_match_receipts (
 profile_id uuid not null references tcg_private.profile_owners(profile_id),
 game_id uuid not null,
 mode text not null check(mode in ('ai','online')),
 won boolean not null,
 packs_awarded smallint not null check(packs_awarded in(0,1)),
 recorded_at timestamptz not null default now(),
 primary key(profile_id,game_id)
);
alter table tcg_private.host_match_receipts enable row level security;
revoke all on tcg_private.host_match_receipts from public,anon,authenticated,service_role;
create function public.tcg_record_host_result(p_game uuid,p_mode text,p_won boolean,p_match jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; receipt tcg_private.host_match_receipts%rowtype; award integer; account tcg_private.economy_accounts%rowtype; history jsonb; favorite text;
begin
 select profile_id into owner_id from tcg_private.profile_owners where auth_user_id=auth.uid();
 if owner_id is null then raise exception 'Account required' using errcode='42501'; end if;
 if p_game is null or p_mode is null or p_mode not in ('ai','online') or p_won is null or p_match is null or jsonb_typeof(p_match)<>'object' or octet_length(p_match::text)>16384 then raise exception 'Invalid match result' using errcode='22023'; end if;
 select * into account from tcg_private.economy_accounts where profile_id=owner_id for update;
 if not found then raise exception 'Economy unavailable'; end if;
 select * into receipt from tcg_private.host_match_receipts where profile_id=owner_id and game_id=p_game;
 if found then
  if receipt.mode<>p_mode or receipt.won<>p_won then raise exception 'Match identity reused' using errcode='22023'; end if;
 else
  award:=case when p_mode='online' or p_won then 1 else 0 end;
  update tcg_private.economy_accounts set packs=packs+award,games_played=games_played+1,games_won=games_won+case when p_won then 1 else 0 end where profile_id=owner_id returning * into account;
  select coalesce(matches,'[]'::jsonb) into history from public.profiles where id=owner_id;
  if jsonb_typeof(history)<>'array' then history:='[]'::jsonb; end if;
  history:=jsonb_build_array(p_match||jsonb_build_object('won',p_won,'mode',p_mode,'date',now()))||history;
  select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into history from jsonb_array_elements(history) with ordinality as h(value,ord) where ord<=20;
  select card #>> '{}' into favorite from jsonb_array_elements(history) h cross join lateral jsonb_array_elements(case when jsonb_typeof(h->'deckCards')='array' then h->'deckCards' else '[]'::jsonb end) card where jsonb_typeof(card)='string' group by card order by count(*) desc,card limit 1;
  update public.profiles set matches=history,stats=jsonb_build_object('gamesPlayed',account.games_played,'gamesWon',account.games_won,'favoriteCard',coalesce(favorite,'-')) where id=owner_id;
  insert into tcg_private.host_match_receipts(profile_id,game_id,mode,won,packs_awarded) values(owner_id,p_game,p_mode,p_won,award) returning * into receipt;
 end if;
 return jsonb_build_object('receipt',to_jsonb(receipt),'economy',public.tcg_economy(),'profile',public.tcg_current_profile());
end; $$;
revoke all on function public.tcg_record_host_result(uuid,text,boolean,jsonb) from public,anon,service_role;
grant execute on function public.tcg_record_host_result(uuid,text,boolean,jsonb) to authenticated;
commit;
