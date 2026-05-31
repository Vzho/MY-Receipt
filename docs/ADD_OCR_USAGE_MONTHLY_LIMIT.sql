alter table public.ocr_usage_monthly
  add column if not exists monthly_limit integer
  check (monthly_limit is null or monthly_limit > 0);

update public.ocr_usage_monthly
set monthly_limit = case provider
  when 'tencent' then 900
  when 'qwen_vl' then 100
  when 'deepseek_v4' then 500
  else monthly_limit
end
where monthly_limit is null
  and provider in ('tencent', 'qwen_vl', 'deepseek_v4');

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

  insert into public.ocr_usage_monthly (user_id, period, provider, units, monthly_limit, updated_at)
  values (p_user_id, p_period, p_provider, p_units, p_limit, now())
  on conflict (user_id, period, provider)
  do update set
    units = public.ocr_usage_monthly.units + excluded.units,
    monthly_limit = excluded.monthly_limit,
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
