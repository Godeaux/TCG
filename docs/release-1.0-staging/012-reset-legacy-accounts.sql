-- Execute only after maintenance/freeze, a refreshed verified backup, frontend
-- readiness, account policies 011, and the chosen progression path are verified.
-- Explicit owner authorization: reset every legacy account, including Pnut.
-- Never delete provider Auth users indiscriminately or reset the private ledger.
begin;
lock table public.profiles,public.decks,public.lobbies,public.game_sessions,
 public.duel_invites,public.friendships,public.player_cards,
 public.bug_reports,public.bug_report_votes,public.match_history,
 public.match_cards_played in access exclusive mode;
-- Old clients must already be unable to recreate a plaintext-PIN account.
do $$begin
 if has_table_privilege('authenticated','public.profiles','INSERT')
   or has_column_privilege('authenticated','public.profiles','pin','SELECT')
   or has_column_privilege('authenticated','public.profiles','current_auth_id','UPDATE') then
  raise exception 'Account policies have not been switched; reset refused';
 end if;
 if exists(select 1 from tcg_private.match_checkpoints) then
  raise exception 'Trusted matches need an explicit drain plan; reset refused';
 end if;
end $$;
create temporary table retiring_profiles on commit drop as
 select p.id,p.current_auth_id from public.profiles p
 where not exists(select 1 from tcg_private.profile_owners o where o.profile_id=p.id);
-- Saved decks/lobbies also historically used transient auth IDs without FKs.
delete from public.decks where owner_id in(select id from retiring_profiles)
 or owner_id in(select current_auth_id from retiring_profiles where current_auth_id is not null);
-- End pre-cutover lobbies/sessions. There are no trusted matches (asserted above).
delete from public.game_sessions;
delete from public.lobbies;
delete from public.duel_invites where sender_id in(select id from retiring_profiles)
 or receiver_id in(select id from retiring_profiles);
-- FK cascades retire owned cards, friends, votes and match rows. Reports keep
-- their contents with attribution nulled by the existing ON DELETE SET NULL FK.
delete from public.profiles where id in(select id from retiring_profiles);
commit;
