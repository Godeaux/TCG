-- STAGING ONLY; refuses to destroy any owner mapping or game data.
-- Never use this as a production rollback after accepting v2 traffic.
begin;
lock table tcg_private.profile_owners, tcg_private.match_checkpoints,
  tcg_private.accepted_actions in access exclusive mode;
do $$
begin
  if exists (select 1 from tcg_private.profile_owners)
     or exists (select 1 from tcg_private.match_checkpoints)
     or exists (select 1 from tcg_private.accepted_actions) then
    raise exception 'Refusing rollback: staging foundation contains data';
  end if;
end $$;
drop table tcg_private.accepted_actions;
drop table tcg_private.match_checkpoints;
drop table tcg_private.profile_owners;
drop schema tcg_private; -- no CASCADE: unknown objects prevent rollback
commit;
