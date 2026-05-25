-- Add ResitAI Phase 5 automation fields.
-- Safe to run multiple times after Phase 4.
--
-- Webhook / enterprise callback tables were removed from the active scope.
-- Keep this migration limited to internal auto-confirmation metadata.

alter table public.receipts
  add column if not exists auto_synced boolean not null default false,
  add column if not exists auto_sync_rule_name text;
