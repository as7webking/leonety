create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'paddle')),
  provider_customer_id text not null,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (company_id, provider)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  provider text not null check (provider in ('stripe', 'paddle')),
  provider_subscription_id text not null,
  plan text not null default 'pro' check (plan in ('starter', 'pro', 'business')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table if not exists public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'paddle')),
  provider_payment_id text not null,
  amount integer not null,
  currency text not null,
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'paddle')),
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists billing_customers_company_idx on public.billing_customers(company_id);
create index if not exists billing_subscriptions_company_idx on public.billing_subscriptions(company_id);
create index if not exists billing_payments_company_idx on public.billing_payments(company_id);
create index if not exists billing_events_provider_idx on public.billing_events(provider, event_type);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists billing_customers_owner_select on public.billing_customers;
create policy billing_customers_owner_select on public.billing_customers
  for select using (exists (
    select 1 from public.companies c
    where c.id = billing_customers.company_id and c.owner_id = auth.uid()
  ));

drop policy if exists billing_subscriptions_owner_select on public.billing_subscriptions;
create policy billing_subscriptions_owner_select on public.billing_subscriptions
  for select using (exists (
    select 1 from public.companies c
    where c.id = billing_subscriptions.company_id and c.owner_id = auth.uid()
  ));

drop policy if exists billing_payments_owner_select on public.billing_payments;
create policy billing_payments_owner_select on public.billing_payments
  for select using (exists (
    select 1 from public.companies c
    where c.id = billing_payments.company_id and c.owner_id = auth.uid()
  ));

-- billing_events intentionally has no client-readable policy.
-- Webhooks should use server-side code only, then update app_access with manual_override=false.
