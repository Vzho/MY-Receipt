-- Remove deferred webhook / enterprise callback infrastructure.
-- Safe to run more than once.

drop table if exists public.webhook_delivery_logs cascade;
drop table if exists public.user_webhook_configs cascade;
