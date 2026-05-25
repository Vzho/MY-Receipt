-- Restore ResitAI anonymous trial access.
-- Anonymous users are still isolated by user_id and Storage folder ownership.
-- This intentionally accepts Supabase's auth_allow_anonymous_sign_ins advisor warning.

alter policy "Users can read own receipts"
  on public.receipts
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own receipts"
  on public.receipts
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own receipts"
  on public.receipts
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own receipts"
  on public.receipts
  using ((select auth.uid()) = user_id);

alter policy "Users can read own receipt items"
  on public.receipt_items
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own receipt items"
  on public.receipt_items
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own receipt items"
  on public.receipt_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own receipt items"
  on public.receipt_items
  using ((select auth.uid()) = user_id);

alter policy "Users can read own custom document types"
  on public.custom_document_types
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own custom document types"
  on public.custom_document_types
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own custom document types"
  on public.custom_document_types
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own custom document types"
  on public.custom_document_types
  using ((select auth.uid()) = user_id);

alter policy "Users can read own field preferences"
  on public.user_field_preferences
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own field preferences"
  on public.user_field_preferences
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own field preferences"
  on public.user_field_preferences
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own field preferences"
  on public.user_field_preferences
  using ((select auth.uid()) = user_id);

alter policy "Users can read own OCR usage"
  on public.ocr_usage_monthly
  using ((select auth.uid()) = user_id);

do $$
begin
  if to_regclass('public.receipt_field_changes') is not null then
    alter policy "Users can read own receipt field changes"
      on public.receipt_field_changes
      using ((select auth.uid()) = user_id);

    alter policy "Users can insert own receipt field changes"
      on public.receipt_field_changes
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

alter policy "Users can read own receipt files"
  on storage.objects
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

alter policy "Users can upload own receipt files"
  on storage.objects
  with check (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

alter policy "Users can update own receipt files"
  on storage.objects
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

alter policy "Users can delete own receipt files"
  on storage.objects
  using (
    bucket_id = 'receipts'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
