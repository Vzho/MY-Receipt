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

alter table public.user_webhook_configs enable row level security;

drop policy if exists "Users can read own webhook configs" on public.user_webhook_configs;
create policy "Users can read own webhook configs"
  on public.user_webhook_configs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own webhook configs" on public.user_webhook_configs;
create policy "Users can insert own webhook configs"
  on public.user_webhook_configs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own webhook configs" on public.user_webhook_configs;
create policy "Users can update own webhook configs"
  on public.user_webhook_configs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own webhook configs" on public.user_webhook_configs;
create policy "Users can delete own webhook configs"
  on public.user_webhook_configs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_webhook_configs to authenticated;
