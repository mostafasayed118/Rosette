-- Allow notification deliveries to record an intentional no-op when email
-- delivery is disabled by deployment configuration (e.g. Cloudflare Workers
-- without SMTP). `skipped` rows are terminal and never retried.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));
