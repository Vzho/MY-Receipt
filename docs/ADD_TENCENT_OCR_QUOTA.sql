create table if not exists public.ocr_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  provider text not null,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period, provider)
);

create index if not exists idx_ocr_usage_monthly_provider_period
  on public.ocr_usage_monthly (provider, period);

alter table public.ocr_usage_monthly enable row level security;

drop policy if exists "Users can read own OCR usage" on public.ocr_usage_monthly;
create policy "Users can read own OCR usage"
  on public.ocr_usage_monthly for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

create or replace function public.consume_ocr_quota(
  p_user_id uuid,
  p_period text,
  p_provider text,
  p_units integer,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_units integer;
  current_units integer;
begin
  if p_user_id is null or p_period is null or p_provider is null then
    raise exception 'Missing quota identity';
  end if;

  if p_units <= 0 or p_limit <= 0 then
    raise exception 'Invalid quota request';
  end if;

  if p_units > p_limit then
    return 0;
  end if;

  insert into public.ocr_usage_monthly (user_id, period, provider, units, updated_at)
  values (p_user_id, p_period, p_provider, p_units, now())
  on conflict (user_id, period, provider)
  do update set
    units = public.ocr_usage_monthly.units + excluded.units,
    updated_at = now()
  where public.ocr_usage_monthly.units + excluded.units <= p_limit
  returning units into new_units;

  if new_units is null then
    select units into current_units
    from public.ocr_usage_monthly
    where user_id = p_user_id
      and period = p_period
      and provider = p_provider;
    return -coalesce(current_units, 0);
  end if;

  return new_units;
end;
$$;

revoke all on function public.consume_ocr_quota(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ocr_quota(uuid, text, text, integer, integer)
  to service_role;
