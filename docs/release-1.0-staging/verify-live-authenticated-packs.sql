begin;
set local statement_timeout='15s';
do $qa$
declare p uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
  opening uuid:=gen_random_uuid(); first jsonb; retry jsonb; denied boolean;
begin
  insert into auth.users(id) values(u),(stranger);
  insert into public.profiles(id,username) values(p,'__qa_pack_api_'||replace(p::text,'-',''));
  insert into tcg_private.profile_owners(profile_id,auth_user_id) values(p,u);
  insert into tcg_private.economy_accounts(profile_id,packs) values(p,1);
  perform set_config('request.jwt.claim.sub',u::text,true);
  set local role authenticated;
  first:=public.tcg_open_pack(opening);
  retry:=public.tcg_open_pack(opening);
  if first<>retry or (first->'economy'->>'packs')::int<>0 then raise exception 'QA retry/debit failed'; end if;
  if jsonb_array_length(first->'receipt'->'cards')<>5 then raise exception 'QA draw size failed'; end if;
  if not exists(select from jsonb_array_elements(first->'receipt'->'cards') c where (c->>'rarity_rank')::int>=1)
    then raise exception 'QA rarity guarantee failed'; end if;
  denied:=false;
  begin perform public.tcg_open_pack(gen_random_uuid());
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'QA overspend accepted'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  if public.tcg_economy() is not null then raise exception 'QA stranger read economy'; end if;
  denied:=false;
  begin perform public.tcg_open_pack(opening);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA stranger opened pack'; end if;
  set local role anon;
  denied:=false;
  begin perform public.tcg_open_pack(opening);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA anonymous opened pack'; end if;
  reset role;
end $qa$;
select 'PASS: deployed authenticated API, server draws, guaranteed rarity, single debit, retry at zero, stranger and anonymous refusal; QA fixtures rolled back' as result;
rollback;
