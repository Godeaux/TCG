begin;
set local statement_timeout='15s';
do $qa$
declare
  p uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  opening uuid:=gen_random_uuid(); lobby bigint; receipt jsonb; retry jsonb; opened jsonb;
  cards jsonb; balance bigint; denied boolean;
begin
  insert into auth.users(id) values(u);
  insert into public.profiles(id,username) values(p,'__qa_reward_'||replace(p::text,'-',''));
  insert into public.lobbies(code,status,host_id) values('QA-'||m::text,'closed',u) returning id into lobby;
  insert into tcg_private.profile_owners(profile_id,auth_user_id) values(p,u);
  insert into tcg_private.match_checkpoints values(m,lobby,1,1,'{}','{}','{}',now());
  insert into tcg_private.accepted_actions values(m,gen_random_uuid(),u,1);
  insert into tcg_private.match_seats values(m,0,p);
  insert into tcg_private.reward_results(match_id,profile_id,final_revision,won,eligible,policy_version)
    values(m,p,1,true,true,'qa-synthetic-not-gameplay');
  set local role service_role;
  receipt:=tcg_private.settle_reward(m,p);
  retry:=tcg_private.settle_reward(m,p);
  if receipt<>retry then raise exception 'QA reward receipt changed'; end if;
  select packs into balance from tcg_private.economy_accounts where profile_id=p;
  if balance<>1 then raise exception 'QA duplicate reward credited'; end if;
  cards:=jsonb_build_array(
    jsonb_build_object('card_id','fish-prey-atlantic-flying-fish','rarity_rank',0),
    jsonb_build_object('card_id','fish-prey-atlantic-flying-fish','rarity_rank',1),
    jsonb_build_object('card_id','fish-prey-atlantic-flying-fish','rarity_rank',2),
    jsonb_build_object('card_id','fish-prey-atlantic-flying-fish','rarity_rank',3),
    jsonb_build_object('card_id','fish-prey-atlantic-flying-fish','rarity_rank',4));
  opened:=tcg_private.open_pack(p,opening,cards);
  retry:=tcg_private.open_pack(p,opening,null);
  if opened<>retry then raise exception 'QA opening receipt changed'; end if;
  select packs into balance from tcg_private.economy_accounts where profile_id=p;
  if balance<>0 then raise exception 'QA debit not exactly once'; end if;
  if (select rarity_rank from tcg_private.card_inventory where profile_id=p and card_id='fish-prey-atlantic-flying-fish')<>4 then
    raise exception 'QA rarity upgrade failed'; end if;
  denied:=false;
  begin perform tcg_private.open_pack(p,gen_random_uuid(),cards);
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'QA overspend allowed'; end if;
  set local role anon;
  denied:=false;
  begin perform tcg_private.settle_reward(m,p);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA anonymous settlement allowed'; end if;
  set local role authenticated;
  denied:=false;
  begin perform tcg_private.open_pack(p,opening,cards);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA authenticated opening allowed'; end if;
  reset role;
end $qa$;
select 'PASS: real Supabase reward retry, pack retry at zero, one debit, highest rarity, overspend refusal, anon settlement refusal, authenticated opening refusal; synthetic fixtures rolled back' as qa_result;
rollback;