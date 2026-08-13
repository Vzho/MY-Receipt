create or replace function public.keepalive_ping()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object('ok', true, 'at', now());
$$;

revoke all on function public.keepalive_ping()
  from public;

grant execute on function public.keepalive_ping()
  to anon, authenticated;
