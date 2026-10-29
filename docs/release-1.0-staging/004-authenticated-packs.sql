-- Additive API for independently verified owners only. No legacy ownership claims.
begin;
-- First 32 UUID v4 bits are cryptographically random (not version/variant bits).
-- Rejection sampling avoids modulo bias. Never use client randomness/draws.
create function tcg_private.random_below(bound integer) returns integer
language plpgsql volatile set search_path='' as $$
declare sample bigint; ceiling bigint;
begin
  if bound is null or bound<1 then raise exception 'Invalid random bound'; end if;
  ceiling := 4294967296 - (4294967296 % bound);
  loop
    sample := ('x'||substr(gen_random_uuid()::text,1,8))::bit(32)::bigint;
    if sample<ceiling then return (sample % bound)::integer; end if;
  end loop;
end; $$;
revoke all on function tcg_private.random_below(integer) from public,anon,authenticated,service_role;

create function public.tcg_economy() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select profile_id into owner_id from tcg_private.profile_owners where auth_user_id=auth.uid();
  if owner_id is null then return null; end if;
  select jsonb_build_object('profile_id',owner_id,'packs',a.packs,
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('card_id',i.card_id,'rarity_rank',i.rarity_rank) order by i.card_id)
      from tcg_private.card_inventory i where i.profile_id=owner_id),'[]'::jsonb))
    into result from tcg_private.economy_accounts a where a.profile_id=owner_id;
  if result is null then raise exception 'Economy account unavailable' using errcode='55000'; end if;
  return result;
end; $$;

create function public.tcg_open_pack(p_opening uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; balance bigint; receipt jsonb; catalog text[];
  draws jsonb := '[]'; roll integer; rank_value integer; best integer := 0; i integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select profile_id into owner_id from tcg_private.profile_owners where auth_user_id=auth.uid();
  if owner_id is null then raise exception 'Verified owner required' using errcode='42501'; end if;
  if p_opening is null then raise exception 'Missing opening identity' using errcode='22023'; end if;
  -- Lock BEFORE receipt lookup/RNG, serializing retries and distinct purchases.
  select packs into balance from tcg_private.economy_accounts where profile_id=owner_id for update;
  if not found then raise exception 'Economy account unavailable' using errcode='55000'; end if;
  select to_jsonb(r) into receipt from tcg_private.pack_receipts r
    where r.profile_id=owner_id and r.opening_id=p_opening;
  if receipt is null then
    if balance<1 then raise exception 'Insufficient packs' using errcode='22023'; end if;
    select array_agg(card_id order by card_id) into catalog from tcg_private.pack_catalog;
    if coalesce(array_length(catalog,1),0)=0 then raise exception 'Pack catalog unavailable' using errcode='55000'; end if;
    for i in 1..5 loop
      roll := tcg_private.random_below(10000);
      rank_value := case when roll<8399 then 0 when roll<9399 then 1
        when roll<9899 then 2 when roll<9999 then 3 else 4 end;
      if i=5 and best=0 then rank_value:=greatest(rank_value,1); end if;
      best:=greatest(best,rank_value);
      draws:=draws||jsonb_build_array(jsonb_build_object(
        'card_id',catalog[1+tcg_private.random_below(array_length(catalog,1))],'rarity_rank',rank_value));
    end loop;
    receipt:=tcg_private.open_pack(owner_id,p_opening,draws);
  end if;
  return jsonb_build_object('receipt',receipt,'economy',public.tcg_economy());
end; $$;
revoke all on function public.tcg_economy() from public,anon,service_role;
revoke all on function public.tcg_open_pack(uuid) from public,anon,service_role;
grant execute on function public.tcg_economy(),public.tcg_open_pack(uuid) to authenticated;
commit;
