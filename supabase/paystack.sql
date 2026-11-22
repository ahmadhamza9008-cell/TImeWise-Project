-- TimeWise — Paystack billing migration.
-- Run after billing.sql. Adds provider-neutral columns so the entitlements
-- table can be driven by Paystack (or future providers) while keeping the
-- existing Stripe columns harmless for backward compatibility.

alter table public.subscriptions
  add column if not exists provider text not null default 'paystack',
  add column if not exists provider_customer_code text,
  add column if not exists provider_subscription_code text,
  add column if not exists provider_email_token text,
  add column if not exists provider_reference text;

-- Paystack uses status values such as non-renewing/attention/completed/cancelled.
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check check (
    status in ('inactive', 'incomplete', 'incomplete_expired', 'trialing',
               'active', 'past_due', 'canceled', 'unpaid', 'paused',
               'non-renewing', 'attention', 'completed', 'cancelled')
  );

create unique index if not exists subscriptions_provider_subscription_code_idx
  on public.subscriptions (provider_subscription_code)
  where provider_subscription_code is not null;

create unique index if not exists subscriptions_provider_customer_code_idx
  on public.subscriptions (provider_customer_code)
  where provider_customer_code is not null;

-- Reuse the webhook replay table for Paystack events (event ids/refs).
-- stripe_webhook_events already exists; keep it as a generic replay guard.
-- No schema change required.

notify pgrst, 'reload schema';
