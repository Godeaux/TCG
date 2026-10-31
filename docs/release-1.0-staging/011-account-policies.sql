-- Coordinated cutover: disables stale PIN clients and browser-authored economy.
-- Requires 010, matching frontend and trusted reward transport before release.
begin;
create function public.tcg_owns_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from tcg_private.profile_owners where profile_id=p_profile and auth_user_id=auth.uid())
$$;
revoke all on function public.tcg_owns_profile(uuid) from public;
grant execute on function public.tcg_owns_profile(uuid) to anon,authenticated,service_role;
-- Replace mutable session ownership in every dependent legacy RLS expression.
-- Profile/deck policies are replaced entirely below, not OR'ed with stricter ones.
do $$declare p record; using_sql text; check_sql text; roles_sql text;
begin
 for p in select * from pg_policies where schemaname='public' loop
  if p.tablename in ('profiles','decks') then
   execute format('drop policy %I on public.%I',p.policyname,p.tablename);
  elsif coalesce(p.qual,'') like '%current_auth_id%' or coalesce(p.with_check,'') like '%current_auth_id%' then
   using_sql:=regexp_replace(p.qual,'([a-z_]+)\.current_auth_id = auth.uid\(\)','public.tcg_owns_profile(\1.id)','g');
   check_sql:=regexp_replace(p.with_check,'([a-z_]+)\.current_auth_id = auth.uid\(\)','public.tcg_owns_profile(\1.id)','g');
   if coalesce(using_sql,'') like '%current_auth_id%' or coalesce(check_sql,'') like '%current_auth_id%' then raise exception 'Unconverted legacy policy %',p.policyname; end if;
   execute format('alter policy %I on public.%I%s%s',p.policyname,p.tablename,
    case when using_sql is not null then ' using ('||using_sql||')' else '' end,
    case when check_sql is not null then ' with check ('||check_sql||')' else '' end);
  end if;
 end loop;
end $$;
revoke all on public.profiles from public,anon,authenticated;
-- Remove any historical column grants as well as table-level grants.
do $$declare column_list text; begin
 select string_agg(quote_ident(column_name),',') into column_list from information_schema.columns where table_schema='public' and table_name='profiles';
 execute 'revoke select ('||column_list||'), insert ('||column_list||'), update ('||column_list||'), references ('||column_list||') on public.profiles from public,anon,authenticated';
end $$;
grant select(id,username,name_style,stats,matches,created_at) on public.profiles to authenticated;
grant update(name_style) on public.profiles to authenticated;
create policy profile_presentation on public.profiles for select to authenticated using(true);
create policy profile_cosmetics on public.profiles for update to authenticated using(public.tcg_owns_profile(id)) with check(public.tcg_owns_profile(id));
create policy owned_decks on public.decks for all to authenticated using(public.tcg_owns_profile(owner_id)) with check(public.tcg_owns_profile(owner_id));
revoke insert,update,delete,truncate,references,trigger on public.player_cards,public.match_history,public.match_cards_played from public,anon,authenticated;
commit;
