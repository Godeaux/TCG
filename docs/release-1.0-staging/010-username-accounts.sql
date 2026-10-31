-- Username/password provider bridge. No user-supplied email or legacy PIN claims.
-- Apply with restrictive account policies, never expose registration beforehand.
begin;
create table tcg_private.username_accounts (
 username_key text primary key check(username_key ~ '^[a-z0-9_]{3,24}$'),
 auth_user_id uuid not null unique references auth.users(id),
 profile_id uuid not null unique references tcg_private.profile_owners(profile_id)
);
create table tcg_private.account_attempts (
 bucket text primary key,
 started_at timestamptz not null,
 attempts integer not null check(attempts>0)
);
alter table tcg_private.username_accounts enable row level security;
alter table tcg_private.account_attempts enable row level security;
revoke all on tcg_private.username_accounts,tcg_private.account_attempts from public,anon,authenticated,service_role;
create function public.tcg_account_attempt(p_username text,p_ip text,p_signup boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare scope text; count_value integer; limit_value integer; allowed boolean:=true;
begin
 if p_username is null or p_ip is null or length(p_username)>24 or length(p_ip)>64 or p_signup is null then return false; end if;
 -- Fixed order locks; count even rejected attempts. Return false, don't roll back.
 foreach scope in array array['ip:'||p_ip||':'||p_signup::text,'name:'||p_username] loop
  limit_value:=case when scope like 'name:%' then 10 when p_signup then 5 else 30 end;
  insert into tcg_private.account_attempts as a values(scope,clock_timestamp(),1)
  on conflict(bucket) do update set
   attempts=case when a.started_at<clock_timestamp()-interval '15 minutes' then 1 else a.attempts+1 end,
   started_at=case when a.started_at<clock_timestamp()-interval '15 minutes' then clock_timestamp() else a.started_at end
  returning attempts into count_value;
  if count_value>limit_value then allowed:=false; end if;
 end loop;
 delete from tcg_private.account_attempts where started_at<clock_timestamp()-interval '1 day';
 return allowed;
end; $$;
create function public.tcg_account_alias(p_username text) returns text
language sql security definer set search_path='' as $$
 select u.email from tcg_private.username_accounts a join auth.users u on u.id=a.auth_user_id
 where a.username_key=lower(p_username)
$$;
create function public.tcg_register_username(p_auth uuid,p_username text) returns uuid
language plpgsql security definer set search_path='' as $$
declare handle text:=btrim(p_username); fresh uuid; existing uuid;
begin
 if handle is null or handle !~ '^[A-Za-z0-9_]{3,24}$' then raise exception 'Invalid username' using errcode='22023'; end if;
 perform 1 from auth.users where id=p_auth and raw_app_meta_data->>'tcg_account_kind'='username'
   and email like '%@accounts.invalid' and not coalesce(is_anonymous,false) for update;
 if not found then raise exception 'Provider username account required' using errcode='42501'; end if;
 select profile_id into existing from tcg_private.username_accounts where auth_user_id=p_auth;
 if existing is not null then return existing; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(handle),0));
 if exists(select 1 from public.profiles where lower(username)=lower(handle)) then
  raise exception 'Username taken' using errcode='23505';
 end if;
 fresh:=gen_random_uuid();
 insert into public.profiles(id,username,pin,current_auth_id,packs) values(fresh,handle,null,p_auth,0);
 insert into tcg_private.profile_owners(profile_id,auth_user_id) values(fresh,p_auth);
 insert into tcg_private.economy_accounts(profile_id) values(fresh);
 insert into tcg_private.username_accounts values(lower(handle),p_auth,fresh);
 return fresh;
end; $$;
create function public.tcg_current_profile() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'name_style',p.name_style,
 'packs',a.packs,'dust',a.dust,'stats',p.stats,'matches',p.matches)
 from tcg_private.profile_owners o join public.profiles p on p.id=o.profile_id
 join tcg_private.economy_accounts a on a.profile_id=o.profile_id where o.auth_user_id=auth.uid()
$$;
revoke all on function public.tcg_account_attempt(text,text,boolean),public.tcg_account_alias(text),public.tcg_register_username(uuid,text),public.tcg_current_profile() from public,anon,authenticated,service_role;
grant execute on function public.tcg_account_attempt(text,text,boolean),public.tcg_account_alias(text),public.tcg_register_username(uuid,text) to service_role;
grant execute on function public.tcg_current_profile() to authenticated;
commit;
