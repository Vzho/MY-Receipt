-- Add ResitAI Phase 4 data structure and audit fields.
-- Safe to run multiple times in Supabase SQL Editor after v0.3 fields.

alter table public.receipts
  add column if not exists currency text not null default 'RM',
  add column if not exists tax_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists address_structured jsonb;

alter table public.receipts
  drop constraint if exists receipts_currency_check;

alter table public.receipts
  add constraint receipts_currency_check
  check (currency in ('RM', 'SGD', 'USD', 'CNY'));

create table if not exists public.receipt_field_changes (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null
    check (action in ('save', 'sync', 'soft_delete', 'restore', 'permanent_delete')),
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_receipt_field_changes_receipt
  on public.receipt_field_changes (receipt_id, changed_at desc);

create index if not exists idx_receipt_field_changes_user
  on public.receipt_field_changes (user_id, changed_at desc);

alter table public.receipt_field_changes enable row level security;

drop policy if exists "Users can read own receipt field changes" on public.receipt_field_changes;
create policy "Users can read own receipt field changes"
  on public.receipt_field_changes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own receipt field changes" on public.receipt_field_changes;
create policy "Users can insert own receipt field changes"
  on public.receipt_field_changes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.receipt_field_changes to authenticated;
