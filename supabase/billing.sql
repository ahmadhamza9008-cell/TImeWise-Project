-- TimeWise — Stage 7 subscription entitlements (Stripe).
-- Run after schema.sql, profiles.sql, push.sql, enhancements.sql and
-- product-requirements.sql. Stripe secrets never enter SQL or browser code.

-- One entitlement row per account. The browser can only READ this table;
-- every write comes from the Stripe webhook using the service role key.
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'inactive' check (
    status in ('inactive', 'incomplete', 'incomplete_expired', 'trialing',
               'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_customer_id_idx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.subscriptions replica identity full;

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Explicit grants: authenticated users may only SELECT; only the service role
-- (used by Edge Functions) may insert/update/delete entitlement rows.
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

-- Webhook replay protection. The Edge Function inserts the event id first;
-- a duplicate id means Stripe is retrying and can be acknowledged safely.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null default '',
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;
grant select, insert, delete on public.stripe_webhook_events to service_role;

-- Reflect plan changes on every signed-in device immediately.
do $$
begin
  alter publication supabase_realtime add table public.subscriptions;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
