-- Internal DDL event hook: never a browser API. Do not change trigger behavior.
begin;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
-- Transactional live regression: existing automatic RLS hook must still run.
create table public.__qa_rls_acl_20261029 (id integer);
do $$begin
  if not (select relrowsecurity from pg_class where oid='public.__qa_rls_acl_20261029'::regclass) then
    raise exception 'RLS event trigger regression';
  end if;
  if has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
    or has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') then
    raise exception 'Internal hook remains browser-executable';
  end if;
end$$;
drop table public.__qa_rls_acl_20261029;
commit;
