-- Add ResitAI Phase 5 automation and integration fields.
-- Safe to run multiple times after Phase 4.

alter table public.receipts
  add column if not exists auto_synced boolean not null default false,
  add column if not exists auto_sync_rule_name text;

create table if not exists public.user_webhook_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  url text not null,
  secret text,
  enabled boolean not null default true,
  events text[] not null default array['receipt.synced'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid references public.receipts(id) on delete set null,
  event text not null default 'receipt.synced',
  endpoint text,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed', 'skipped')),
  http_status integer,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_message text,
  request_payload jsonb,
  response_body text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_webhook_delivery_logs_user_created
  on public.webhook_delivery_logs (user_id, created_at desc);

create index if not exists idx_webhook_delivery_logs_receipt
  on public.webhook_delivery_logs (receipt_id, created_at desc)
  where receipt_id is not null;

alter table public.user_webhook_configs enable row level security;
alter table public.webhook_delivery_logs enable row level security;

drop policy if exists "Users can read own webhook configs" on public.user_webhook_configs;
create policy "Users can read own webhook configs"
  on public.user_webhook_configs for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

drop policy if exists "Users can insert own webhook configs" on public.user_webhook_configs;
create policy "Users can insert own webhook configs"
  on public.user_webhook_configs for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

drop policy if exists "Users can update own webhook configs" on public.user_webhook_configs;
create policy "Users can update own webhook configs"
  on public.user_webhook_configs for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

drop policy if exists "Users can delete own webhook configs" on public.user_webhook_configs;
create policy "Users can delete own webhook configs"
  on public.user_webhook_configs for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

grant select, insert, update, delete on public.user_webhook_configs to authenticated;

drop policy if exists "Users can read own webhook delivery logs" on public.webhook_delivery_logs;
create policy "Users can read own webhook delivery logs"
  on public.webhook_delivery_logs for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) is false
  );

grant select on public.webhook_delivery_logs to authenticated;

drop trigger if exists webhook_delivery_logs_set_updated_at on public.webhook_delivery_logs;
create trigger webhook_delivery_logs_set_updated_at
  before update on public.webhook_delivery_logs
  for each row execute function public.set_updated_at();
