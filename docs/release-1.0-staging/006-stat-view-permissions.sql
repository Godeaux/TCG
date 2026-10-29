-- These views are not referenced by the current game client. Their aggregates
-- must respect base-table RLS, rather than execute as the view creator.
begin;
alter view public.player_stats set (security_invoker=true);
alter view public.player_favorite_card set (security_invoker=true);
-- Isolated synthetic regression; subtransaction rollback leaves NO fixture rows.
do $qa$
declare u uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  p uuid:=gen_random_uuid(); match_id uuid:=gen_random_uuid();
begin
  begin
    insert into auth.users(id) values(u),(outsider);
    insert into public.profiles(id,username,current_auth_id)
      values(p,'__qa_view_'||replace(p::text,'-',''),u);
    insert into public.match_history(id,player_id,opponent_name,won,player_final_hp,opponent_final_hp,turns)
      values(match_id,p,'__qa_opponent',true,10,0,5);
    insert into public.match_cards_played(match_id,profile_id,card_id,times_played)
      values(match_id,p,'__qa_card',2);
    perform set_config('request.jwt.claim.sub',u::text,true);
    set local role authenticated;
    if not exists(select from public.player_stats where player_id=p and games_played=1 and games_won=1)
      then raise exception 'QA owner lost stats access'; end if;
    if not exists(select from public.player_favorite_card where profile_id=p and total_plays=2)
      then raise exception 'QA owner lost favorite-card access'; end if;
    perform set_config('request.jwt.claim.sub',outsider::text,true);
    if exists(select from public.player_stats where player_id=p)
      then raise exception 'QA stats view bypasses RLS'; end if;
    if exists(select from public.player_favorite_card where profile_id=p)
      then raise exception 'QA favorite-card view bypasses RLS'; end if;
    raise exception using errcode='P0002',message='qa_view_rollback';
  exception when no_data_found then
    if sqlerrm<>'qa_view_rollback' then raise; end if;
  end;
end $qa$;
commit;
