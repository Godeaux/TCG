-- Additive counted inventory; retain best-rarity inventory for existing clients.
begin;
alter table tcg_private.economy_accounts add column dust bigint not null default 0 check(dust>=0);
create table tcg_private.card_finishes (
 profile_id uuid not null references tcg_private.profile_owners(profile_id),
 card_id text not null references tcg_private.pack_catalog(card_id),
 rarity_rank smallint not null check(rarity_rank between 0 and 4),
 quantity bigint not null check(quantity>0),
 primary key(profile_id,card_id,rarity_rank)
);
-- Receipts are authoritative evidence of copies; legacy best ownership is a floor,
-- not an additional copy on top of the same recorded draws.
insert into tcg_private.card_finishes
 select r.profile_id,c->>'card_id',(c->>'rarity_rank')::smallint,count(*)
 from tcg_private.pack_receipts r cross join lateral jsonb_array_elements(r.cards) c
 group by r.profile_id,c->>'card_id',(c->>'rarity_rank')::smallint;
insert into tcg_private.card_finishes
 select profile_id,card_id,rarity_rank,1 from tcg_private.card_inventory
 on conflict(profile_id,card_id,rarity_rank) do nothing;
create table tcg_private.dust_receipts (
 profile_id uuid not null references tcg_private.profile_owners(profile_id),
 operation_id uuid not null,
 action text not null check(action in ('craft','recycle')),
 card_id text,
 rarity_rank smallint,
 dust_delta bigint not null,
 created_at timestamptz not null default now(),
 primary key(profile_id,operation_id)
);
alter table tcg_private.card_finishes enable row level security;
alter table tcg_private.dust_receipts enable row level security;
revoke all on tcg_private.card_finishes,tcg_private.dust_receipts from public,anon,authenticated,service_role;
grant select on tcg_private.card_finishes,tcg_private.dust_receipts to service_role;
create function tcg_private.count_pack_copies() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb;
begin
 for c in select value from jsonb_array_elements(new.cards) loop
  insert into tcg_private.card_finishes values(new.profile_id,c->>'card_id',(c->>'rarity_rank')::smallint,1)
  on conflict(profile_id,card_id,rarity_rank) do update set quantity=tcg_private.card_finishes.quantity+1;
 end loop;
 return new;
end; $$;
revoke all on function tcg_private.count_pack_copies() from public,anon,authenticated,service_role;
create trigger count_pack_copies after insert on tcg_private.pack_receipts
 for each row execute function tcg_private.count_pack_copies();
create or replace function public.tcg_economy() returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select profile_id into owner_id from tcg_private.profile_owners where auth_user_id=auth.uid();
 if owner_id is null then return null; end if;
 select jsonb_build_object('profile_id',owner_id,'packs',a.packs,'dust',a.dust,
 'inventory',coalesce((select jsonb_agg(jsonb_build_object('card_id',i.card_id,'rarity_rank',i.rarity_rank) order by i.card_id) from tcg_private.card_inventory i where i.profile_id=owner_id),'[]'::jsonb),
 'finishes',coalesce((select jsonb_agg(jsonb_build_object('card_id',f.card_id,'rarity_rank',f.rarity_rank,'quantity',f.quantity) order by f.card_id,f.rarity_rank) from tcg_private.card_finishes f where f.profile_id=owner_id),'[]'::jsonb))
 into result from tcg_private.economy_accounts a where a.profile_id=owner_id;
 if result is null then raise exception 'Economy account unavailable' using errcode='55000'; end if;
 return result;
end; $$;
create function public.tcg_dust_action(p_operation uuid,p_action text,p_card text default null,p_rarity integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; balance bigint; delta bigint; receipt tcg_private.dust_receipts%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select profile_id into owner_id from tcg_private.profile_owners where auth_user_id=auth.uid();
 if owner_id is null then raise exception 'Verified owner required' using errcode='42501'; end if;
 if p_operation is null then raise exception 'Missing operation identity' using errcode='22023'; end if;
 select dust into balance from tcg_private.economy_accounts where profile_id=owner_id for update;
 if not found then raise exception 'Economy account unavailable' using errcode='55000'; end if;
 select * into receipt from tcg_private.dust_receipts where profile_id=owner_id and operation_id=p_operation;
 if found then
  if receipt.action is distinct from p_action or receipt.card_id is distinct from p_card or receipt.rarity_rank is distinct from p_rarity then
   raise exception 'Operation identity reused with different request' using errcode='22023';
  end if;
  return jsonb_build_object('receipt',to_jsonb(receipt),'economy',public.tcg_economy());
 end if;
 if p_action='craft' then
  if p_rarity is null or p_rarity not between 0 and 4 or p_card is null or not exists(select 1 from tcg_private.pack_catalog where card_id=p_card) then
   raise exception 'Invalid craft target' using errcode='22023';
  end if;
  if exists(select 1 from tcg_private.card_finishes where profile_id=owner_id and card_id=p_card and rarity_rank=p_rarity) then
   raise exception 'Finish already owned' using errcode='22023';
  end if;
  delta := -(4::bigint ^ (p_rarity+1))::bigint;
  if balance+delta<0 then raise exception 'Insufficient dust' using errcode='22023'; end if;
  insert into tcg_private.card_finishes values(owner_id,p_card,p_rarity,1);
  insert into tcg_private.card_inventory values(owner_id,p_card,p_rarity)
   on conflict(profile_id,card_id) do update set rarity_rank=greatest(tcg_private.card_inventory.rarity_rank,excluded.rarity_rank);
 elsif p_action='recycle' and p_card is null and p_rarity is null then
  select coalesce(sum((quantity-1)*(4::bigint ^ rarity_rank)::bigint),0) into delta from tcg_private.card_finishes where profile_id=owner_id;
  update tcg_private.card_finishes set quantity=1 where profile_id=owner_id and quantity>1;
 else raise exception 'Invalid dust action' using errcode='22023'; end if;
 update tcg_private.economy_accounts set dust=dust+delta where profile_id=owner_id;
 insert into tcg_private.dust_receipts(profile_id,operation_id,action,card_id,rarity_rank,dust_delta)
 values(owner_id,p_operation,p_action,p_card,p_rarity,delta) returning * into receipt;
 return jsonb_build_object('receipt',to_jsonb(receipt),'economy',public.tcg_economy());
end; $$;
revoke all on function public.tcg_dust_action(uuid,text,text,integer) from public,anon,service_role;
grant execute on function public.tcg_dust_action(uuid,text,text,integer) to authenticated;
commit;
