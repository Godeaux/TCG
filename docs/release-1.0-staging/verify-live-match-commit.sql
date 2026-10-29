-- Privileged QA only. Fixtures and all test writes roll back; no player rows used.
begin;
set local statement_timeout='15s';
do $qa$
declare
  p uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid();
  outsider uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  lobby bigint; first jsonb; retry jsonb; denied boolean;
begin
  insert into auth.users(id) values(u);
  insert into public.profiles(id,username) values(p,'__qa_atomic_'||p::text);
  insert into public.lobbies(code,status,host_id) values('QA-'||m::text,'closed',u) returning id into lobby;
  insert into tcg_private.profile_owners(profile_id,auth_user_id) values(p,u);
  insert into tcg_private.match_checkpoints(match_id,lobby_id,generation,revision,canonical_state,seat_zero_view,seat_one_view)
    values(m,lobby,1,0,'{"turn":1}','{}','{}');
  insert into tcg_private.match_seats values(m,0,p);
  set local role service_role;
  first:=tcg_private.commit_match_action(m,a,u,0,'{"type":"END_TURN"}','{"turn":2}','{"seat":0}','{"seat":1}',false);
  retry:=tcg_private.commit_match_action(m,a,u,0,'{"type":"END_TURN"}','{"turn":999}','{}','{}',false);
  if first<>retry then raise exception 'QA receipt changed'; end if;
  if (select canonical_state from tcg_private.match_checkpoints where match_id=m)<>'{"turn":2}'::jsonb then
    raise exception 'QA retry overwrote canonical state'; end if;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,b,u,0,'{}','{}','{}','{}',false);
  exception when serialization_failure then denied:=true; end;
  if not denied then raise exception 'QA stale revision accepted'; end if;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,a,u,0,'{"type":"DRAW_CARD"}','{}','{}','{}',false);
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'QA changed request accepted'; end if;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,b,outsider,1,'{}','{}','{}','{}',false);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA outsider accepted'; end if;
  perform tcg_private.commit_match_action(m,b,u,1,'{"type":"END_TURN"}','{"turn":3}','{"seat":0}','{"seat":1}',true);
  retry:=tcg_private.commit_match_action(m,a,u,0,'{"type":"END_TURN"}',null,null,null,null);
  if retry<>first then raise exception 'QA retry after terminal failed'; end if;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,gen_random_uuid(),u,2,'{}','{}','{}','{}',false);
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'QA finished match changed'; end if;
  denied:=false;
  begin update tcg_private.match_checkpoints set revision=99 where match_id=m;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA direct service overwrite allowed'; end if;
  if (select revision from tcg_private.match_checkpoints where match_id=m)<>2
    or (select count(*) from tcg_private.accepted_actions where match_id=m)<>2 then
    raise exception 'QA checkpoint/receipt mismatch'; end if;
  set local role authenticated;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,gen_random_uuid(),u,2,'{}','{}','{}','{}',false);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA browser commit allowed'; end if;
  set local role anon;
  denied:=false;
  begin perform tcg_private.commit_match_action(m,gen_random_uuid(),u,2,'{}','{}','{}','{}',false);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'QA anonymous commit allowed'; end if;
  reset role;
end $qa$;
select 'PASS: live match commit, stale/foreign/browser/direct-write refusal, stable retry after finish, checkpoint/receipt consistency. Fixtures rolled back. Not a concurrency certificate.' as qa_result;
rollback;
