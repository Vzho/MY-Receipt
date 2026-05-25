-- Add ResitAI v0.3 audit workflow, soft delete, duplicate detection,
-- field preferences, custom document types, and e-invoice extension fields.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.receipts
  add column if not exists file_hash text,
  add column if not exists processing_stage text,
  add column if not exists custom_doc_type text,
  add column if not exists extra_fields jsonb,
  add column if not exists warnings jsonb not null default '[]'::jsonb,
  add column if not exists duplicate_of uuid references public.receipts(id) on delete set null,
  add column if not exists duplicate_score numeric(4,3),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists deleted_note text;

alter table public.receipts
  drop constraint if exists receipts_doc_type_check;

alter table public.receipts
  add constraint receipts_doc_type_check
  check (doc_type in ('Receipt', 'Invoice', 'Credit Note', 'Expense', 'E-invoice'));

alter table public.receipts
  drop constraint if exists receipts_processing_stage_check;

alter table public.receipts
  add constraint receipts_processing_stage_check
  check (
    processing_stage is null
    or processing_stage in ('uploaded', 'ocr_scanning', 'ai_extracting', 'generating_preview', 'ready_for_review', 'ocr_failed')
  );

create index if not exists idx_receipts_user_not_deleted_created
  on public.receipts (user_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_receipts_user_file_hash
  on public.receipts (user_id, file_hash)
  where file_hash is not null;

create index if not exists idx_receipts_duplicate_of
  on public.receipts (duplicate_of)
  where duplicate_of is not null;

create index if not exists idx_receipt_items_user_id
  on public.receipt_items (user_id);

create table if not exists public.custom_document_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.user_field_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  enabled boolean not null default true,
  export_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, field_key)
);

alter table public.custom_document_types enable row level security;
alter table public.user_field_preferences enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "Users can read own custom document types" on public.custom_document_types;
create policy "Users can read own custom document types"
  on public.custom_document_types for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can insert own custom document types" on public.custom_document_types;
create policy "Users can insert own custom document types"
  on public.custom_document_types for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can update own custom document types" on public.custom_document_types;
create policy "Users can update own custom document types"
  on public.custom_document_types for update
  to authenticated
  using (
    (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can delete own custom document types" on public.custom_document_types;
create policy "Users can delete own custom document types"
  on public.custom_document_types for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can read own field preferences" on public.user_field_preferences;
create policy "Users can read own field preferences"
  on public.user_field_preferences for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can insert own field preferences" on public.user_field_preferences;
create policy "Users can insert own field preferences"
  on public.user_field_preferences for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can update own field preferences" on public.user_field_preferences;
create policy "Users can update own field preferences"
  on public.user_field_preferences for update
  to authenticated
  using (
    (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can delete own field preferences" on public.user_field_preferences;
create policy "Users can delete own field preferences"
  on public.user_field_preferences for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can read own receipts" on public.receipts;
create policy "Users can read own receipts"
  on public.receipts for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can insert own receipts" on public.receipts;
create policy "Users can insert own receipts"
  on public.receipts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can update own receipts" on public.receipts;
create policy "Users can update own receipts"
  on public.receipts for update
  to authenticated
  using (
    (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can delete own receipts" on public.receipts;
create policy "Users can delete own receipts"
  on public.receipts for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can read own receipt items" on public.receipt_items;
create policy "Users can read own receipt items"
  on public.receipt_items for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can insert own receipt items" on public.receipt_items;
create policy "Users can insert own receipt items"
  on public.receipt_items for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can update own receipt items" on public.receipt_items;
create policy "Users can update own receipt items"
  on public.receipt_items for update
  to authenticated
  using (
    (select auth.uid()) = user_id
  )
  with check (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can delete own receipt items" on public.receipt_items;
create policy "Users can delete own receipt items"
  on public.receipt_items for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can read own OCR usage" on public.ocr_usage_monthly;
create policy "Users can read own OCR usage"
  on public.ocr_usage_monthly for select
  to authenticated
  using (
    (select auth.uid()) = user_id
  );

drop policy if exists "Users can read own receipt files" on storage.objects;
create policy "Users can read own receipt files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload own receipt files" on storage.objects;
create policy "Users can upload own receipt files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own receipt files" on storage.objects;
create policy "Users can update own receipt files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own receipt files" on storage.objects;
create policy "Users can delete own receipt files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop trigger if exists user_field_preferences_set_updated_at on public.user_field_preferences;
create trigger user_field_preferences_set_updated_at
  before update on public.user_field_preferences
  for each row execute function public.set_updated_at();
