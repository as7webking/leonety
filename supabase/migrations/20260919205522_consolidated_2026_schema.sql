-- Consolidated Leonety 2026 schema migration.
-- Replaces the 2026-prefixed SQL files formerly split between migrations/
-- and supabase/migrations/. Non-2026 migrations remain intentionally separate.
--
-- Dependency assumptions: the pre-2026 core schema already provides companies,
-- clients, invoices, invoice_payments, incomes, expenses, time_entries and app_access.
-- This migration contains no production row data and does not alter auth.users.

begin;

-- ============================================================================
-- Active timers
-- ============================================================================

-- Workspace-based active timers for the authenticated app.
-- This migration aligns the database with the current client flow:
-- - active_timers are owned through companies.owner_id
-- - starting a timer inserts company_id + description + started_at
-- - stopping a timer persists a time_entries row and removes the active timer


create extension if not exists pgcrypto;

create table if not exists public.active_timers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null default 'Timed session',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists active_timers_company_id_idx
  on public.active_timers(company_id);

create index if not exists active_timers_started_at_idx
  on public.active_timers(started_at);

alter table public.active_timers enable row level security;

drop policy if exists "Users can view own active timers" on public.active_timers;
drop policy if exists "Users can insert own active timers" on public.active_timers;
drop policy if exists "Users can update own active timers" on public.active_timers;
drop policy if exists "Users can delete own active timers" on public.active_timers;

create policy "Users can view own active timers"
on public.active_timers
for select
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can insert own active timers"
on public.active_timers
for insert
with check (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can update own active timers"
on public.active_timers
for update
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can delete own active timers"
on public.active_timers
for delete
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

alter table public.active_timers
  drop constraint if exists uq_active_timers_user_id;

alter table public.active_timers
  add column if not exists paused_at timestamptz,
  add column if not exists accumulated_seconds integer not null default 0;

create or replace function public.enforce_active_timer_limit()
returns trigger
language plpgsql
as $$
declare
  active_timer_count integer;
begin
  select count(*)
  into active_timer_count
  from public.active_timers
  where user_id = new.user_id;

  if active_timer_count >= 7 then
    raise exception 'Maximum of 7 active timers allowed per user'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_active_timer_limit on public.active_timers;

create trigger trg_enforce_active_timer_limit
before insert on public.active_timers
for each row
execute function public.enforce_active_timer_limit();

create or replace function public.pause_active_timer(p_timer_id uuid)
returns public.active_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  timer_row public.active_timers%rowtype;
begin
  update public.active_timers
  set
    accumulated_seconds = accumulated_seconds + greatest(0, floor(extract(epoch from (now() - started_at)))::integer),
    paused_at = now()
  where id = p_timer_id
    and paused_at is null
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    )
  returning *
  into timer_row;

  if not found then
    raise exception 'Active timer not found or access denied'
      using errcode = 'P0001';
  end if;

  return timer_row;
end;
$$;

-- Align timer start with a server-checked RPC and persist exchange-rate snapshots.


alter table public.incomes
  add column if not exists exchange_rate numeric(18,8) not null default 1,
  add column if not exists workspace_currency text not null default 'USD';

alter table public.expenses
  add column if not exists exchange_rate numeric(18,8) not null default 1,
  add column if not exists workspace_currency text not null default 'USD';

update public.incomes
set workspace_currency = coalesce(nullif(workspace_currency, ''), currency),
    exchange_rate = coalesce(exchange_rate, 1)
where workspace_currency is null
   or workspace_currency = ''
   or exchange_rate is null;

update public.expenses
set workspace_currency = coalesce(nullif(workspace_currency, ''), currency),
    exchange_rate = coalesce(exchange_rate, 1)
where workspace_currency is null
   or workspace_currency = ''
   or exchange_rate is null;

create or replace function public.start_active_timer(
  company_uuid uuid,
  timer_description text default 'Timed session',
  timer_started_at timestamptz default now()
)
returns public.active_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  created_timer public.active_timers%rowtype;
begin
  if not exists (
    select 1
    from public.companies c
    where c.id = company_uuid
      and c.owner_id = auth.uid()
  ) then
    raise exception 'Company not found or access denied'
      using errcode = '42501';
  end if;

  insert into public.active_timers (
    company_id,
    description,
    started_at
  )
  values (
    company_uuid,
    coalesce(nullif(trim(timer_description), ''), 'Timed session'),
    coalesce(timer_started_at, now())
  )
  returning *
  into created_timer;

  return created_timer;
end;
$$;

grant execute on function public.start_active_timer(uuid, text, timestamptz) to authenticated;

-- Preserve original timer starts and complete timers server-side.


alter table public.active_timers
  add column if not exists original_started_at timestamptz;

update public.active_timers
set original_started_at = started_at
where original_started_at is null;

alter table public.active_timers
  alter column original_started_at set default now();

alter table public.time_entries
  add column if not exists timer_started_at timestamptz,
  add column if not exists timer_completed_at timestamptz;

create or replace function public.resume_active_timer(p_timer_id uuid)
returns public.active_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  timer_row public.active_timers%rowtype;
begin
  update public.active_timers
  set
    started_at = now(),
    original_started_at = coalesce(original_started_at, started_at),
    paused_at = null
  where id = p_timer_id
    and paused_at is not null
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    )
  returning *
  into timer_row;

  if not found then
    raise exception 'Paused timer not found or access denied'
      using errcode = 'P0001';
  end if;

  return timer_row;
end;
$$;

create or replace function public.stop_active_timer(p_timer_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  active_timer_row public.active_timers%rowtype;
  inserted_entry public.time_entries%rowtype;
  total_seconds integer;
  started_at_for_history timestamptz;
begin
  select *
  into active_timer_row
  from public.active_timers
  where id = p_timer_id
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    );

  if not found then
    raise exception 'Active timer not found or access denied'
      using errcode = 'P0001';
  end if;

  started_at_for_history := coalesce(active_timer_row.original_started_at, active_timer_row.started_at);

  total_seconds := active_timer_row.accumulated_seconds +
    case
      when active_timer_row.paused_at is null
        then greatest(0, floor(extract(epoch from (now() - active_timer_row.started_at)))::integer)
      else 0
    end;

  insert into public.time_entries (
    user_id,
    company_id,
    description,
    hours,
    date,
    timer_started_at,
    timer_completed_at
  )
  values (
    auth.uid(),
    active_timer_row.company_id,
    active_timer_row.description,
    round((total_seconds / 3600.0)::numeric, 2),
    (started_at_for_history at time zone 'utc')::date,
    started_at_for_history,
    now()
  )
  returning *
  into inserted_entry;

  delete from public.active_timers
  where id = active_timer_row.id;

  return inserted_entry;
end;
$$;

grant execute on function public.resume_active_timer(uuid) to authenticated;
grant execute on function public.stop_active_timer(uuid) to authenticated;

-- ============================================================================
-- User subscription controls
-- ============================================================================

-- User-level subscriptions for admin controls and future payment webhooks.

CREATE TABLE IF NOT EXISTS public.admin_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'payment')),
  current_period_end TIMESTAMP WITH TIME ZONE,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- Operations and inventory base
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  job_title text not null,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'minijob', 'freelance', 'contractor', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'on_leave')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_company_id_id_unique unique (company_id, id)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  city text not null,
  country text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_company_id_id_unique unique (company_id, id)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null,
  location_id uuid,
  date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'missed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_valid_time check (end_time > start_time),
  constraint shifts_employee_company_fkey
    foreign key (company_id, employee_id)
    references public.employees(company_id, id)
    on delete restrict,
  constraint shifts_location_company_fkey
    foreign key (company_id, location_id)
    references public.locations(company_id, id)
    on delete restrict
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  category text,
  description text,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  selling_price numeric(12,2) check (selling_price is null or selling_price >= 0),
  currency text not null default 'EUR',
  current_stock numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_company_id_id_unique unique (company_id, id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  type text not null check (type in ('stock_in', 'stock_out', 'adjustment', 'return')),
  quantity numeric(14,3) not null check (quantity >= 0),
  reason text not null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_movements_product_company_fkey
    foreign key (company_id, product_id)
    references public.products(company_id, id)
    on delete restrict
);

create index if not exists employees_company_id_idx on public.employees(company_id);
create index if not exists employees_company_status_idx on public.employees(company_id, status);
create index if not exists locations_company_id_idx on public.locations(company_id);
create index if not exists shifts_company_date_idx on public.shifts(company_id, date);
create index if not exists shifts_employee_date_idx on public.shifts(employee_id, date);
create index if not exists shifts_location_date_idx on public.shifts(location_id, date);
create unique index if not exists shifts_no_exact_duplicate_idx
  on public.shifts(company_id, employee_id, date, start_time, end_time)
  where status <> 'cancelled';
create index if not exists products_company_id_idx on public.products(company_id);
create index if not exists products_company_status_idx on public.products(company_id, status);
create unique index if not exists products_company_sku_unique
  on public.products(company_id, lower(sku))
  where sku is not null and btrim(sku) <> '';
create unique index if not exists products_company_barcode_unique
  on public.products(company_id, barcode)
  where barcode is not null and btrim(barcode) <> '';
create index if not exists stock_movements_company_created_idx
  on public.stock_movements(company_id, created_at desc);
create index if not exists stock_movements_product_created_idx
  on public.stock_movements(product_id, created_at desc);

alter table public.employees enable row level security;
alter table public.locations enable row level security;
alter table public.shifts enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Owners manage employees" on public.employees;
create policy "Owners manage employees" on public.employees
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = employees.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = employees.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage locations" on public.locations;
create policy "Owners manage locations" on public.locations
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = locations.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = locations.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage shifts" on public.shifts;
create policy "Owners manage shifts" on public.shifts
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = shifts.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = shifts.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage products" on public.products;
create policy "Owners manage products" on public.products
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = products.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = products.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners view stock movements" on public.stock_movements;
create policy "Owners view stock movements" on public.stock_movements
for select
using (
  exists (
    select 1 from public.companies c
    where c.id = stock_movements.company_id and c.owner_id = auth.uid()
  )
);

-- ============================================================================
-- WooCommerce and product media
-- ============================================================================

alter table public.products
  add column if not exists image_url text,
  add column if not exists woo_product_type text not null default 'simple'
    check (woo_product_type in ('simple', 'variable')),
  add column if not exists woo_attributes jsonb not null default '[]'::jsonb,
  add column if not exists woo_variants jsonb not null default '[]'::jsonb;

create table if not exists public.woocommerce_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  store_url text not null,
  consumer_key text not null,
  consumer_secret text not null,
  inventory_sync_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_syncs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  channel text not null default 'woocommerce'
    check (channel in ('woocommerce', 'shopify')),
  external_product_id text,
  external_variant_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, channel)
);

create index if not exists product_syncs_company_idx
  on public.product_syncs(company_id);

create index if not exists product_syncs_product_idx
  on public.product_syncs(product_id);

create index if not exists product_syncs_channel_idx
  on public.product_syncs(company_id, channel);

alter table public.product_syncs
  add column if not exists channel text not null default 'woocommerce',
  add column if not exists external_product_id text,
  add column if not exists external_variant_id text,
  add column if not exists last_synced_at timestamptz;

alter table public.product_syncs
  drop constraint if exists product_syncs_sync_status_check;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_syncs'
      and column_name = 'woo_product_id'
  ) then
    update public.product_syncs
    set external_product_id = coalesce(external_product_id, woo_product_id::text);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_syncs'
      and column_name = 'last_sync_at'
  ) then
    update public.product_syncs
    set last_synced_at = coalesce(last_synced_at, last_sync_at);
  end if;
end $$;

update public.product_syncs
set sync_status = case
  when sync_status = 'error' then 'failed'
  when sync_status in ('not_synced', 'pending', 'synced', 'failed') then sync_status
  else 'not_synced'
end;

alter table public.product_syncs
  add constraint product_syncs_sync_status_check
  check (sync_status in ('not_synced', 'pending', 'synced', 'failed'));

alter table public.product_syncs
  drop constraint if exists product_syncs_company_id_product_id_key;

create unique index if not exists product_syncs_company_product_channel_unique
  on public.product_syncs(company_id, product_id, channel);

alter table public.woocommerce_connections enable row level security;
alter table public.product_syncs enable row level security;

drop policy if exists product_syncs_owner_select on public.product_syncs;
create policy product_syncs_owner_select
  on public.product_syncs
  for select
  using (exists (
    select 1 from public.companies c
    where c.id = product_syncs.company_id
      and c.owner_id = auth.uid()
  ));

-- Credentials in woocommerce_connections are intentionally not exposed through RLS.
-- Leonety reads/writes them only from server-side API routes after verifying workspace ownership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_owner_select on storage.objects;
create policy product_images_owner_select
  on storage.objects
  for select
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_images_owner_insert on storage.objects;
create policy product_images_owner_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
  on storage.objects
  for update
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- Billing
-- ============================================================================

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

-- Product categories for Leonety products and billing-to-access sync.
-- Run in Supabase SQL editor. Safe to re-run.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  woo_category_id text,
  shopify_category_id text,
  google_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;

create index if not exists product_categories_company_idx
  on public.product_categories(company_id);

create unique index if not exists product_categories_company_name_unique
  on public.product_categories(company_id, lower(name));

create unique index if not exists app_access_company_unique
  on public.app_access(company_id);

alter table public.product_categories enable row level security;

drop policy if exists product_categories_owner_all on public.product_categories;

create policy product_categories_owner_all
  on public.product_categories
  for all
  using (
    exists (
      select 1
      from public.companies c
      where c.id = product_categories.company_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = product_categories.company_id
        and c.owner_id = auth.uid()
    )
  );

create or replace function public.apply_billing_subscription_to_app_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('trialing', 'active') then
    insert into public.app_access (
      company_id,
      tier,
      manual_override,
      active,
      expires_at,
      updated_at
    )
    values (
      new.company_id,
      new.plan,
      false,
      true,
      new.current_period_end,
      now()
    )
    on conflict (company_id) do update
    set
      tier = excluded.tier,
      manual_override = false,
      active = true,
      expires_at = excluded.expires_at,
      updated_at = now();
  elsif new.status in ('cancelled', 'expired')
    or (
      new.status = 'past_due'
      and new.current_period_end is not null
      and new.current_period_end < now()
    )
  then
    update public.app_access
    set
      active = false,
      expires_at = coalesce(new.current_period_end, now()),
      updated_at = now()
    where company_id = new.company_id
      and manual_override = false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_billing_subscription_to_app_access on public.billing_subscriptions;

create trigger trg_apply_billing_subscription_to_app_access
after insert or update of status, current_period_end, plan
on public.billing_subscriptions
for each row
execute function public.apply_billing_subscription_to_app_access();

-- ============================================================================
-- Store integrations
-- ============================================================================

-- Leonety store integrations schema fix.
-- Safe to re-run. Additive/non-destructive.

create table if not exists public.store_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  store_name text,
  store_url text,
  external_account_id text,
  merchant_id text,
  api_key text,
  api_secret text,
  access_token text,
  refresh_token text,
  status text not null default 'not_connected',
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_integrations
  add column if not exists external_account_id text,
  add column if not exists merchant_id text,
  add column if not exists api_key text,
  add column if not exists api_secret text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists status text not null default 'not_connected',
  add column if not exists last_sync_at timestamptz,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.store_integrations
  drop constraint if exists store_integrations_provider_check,
  drop constraint if exists store_integrations_status_check;

alter table public.store_integrations
  add constraint store_integrations_provider_check
  check (provider in ('woocommerce', 'shopify', 'opencart', 'google_merchant', 'iss_pos')),
  add constraint store_integrations_status_check
  check (status in ('not_connected', 'connected', 'error', 'disabled'));

create unique index if not exists store_integrations_company_provider_unique
  on public.store_integrations(company_id, provider);

create index if not exists store_integrations_company_idx
  on public.store_integrations(company_id);

create index if not exists store_integrations_external_account_idx
  on public.store_integrations(company_id, provider, external_account_id)
  where external_account_id is not null;

alter table public.store_integrations enable row level security;

drop policy if exists store_integrations_owner_select on public.store_integrations;
create policy store_integrations_owner_select
  on public.store_integrations
  for select
  using (
    exists (
      select 1
      from public.companies c
      where c.id = store_integrations.company_id
        and c.owner_id = auth.uid()
    )
  );

do $$
begin
  if to_regclass('public.product_syncs') is not null then
    alter table public.product_syncs
      drop constraint if exists product_syncs_channel_check;

    alter table public.product_syncs
      add constraint product_syncs_channel_check
      check (channel in ('woocommerce', 'shopify', 'opencart', 'google_merchant', 'iss_pos'));
  end if;
end $$;

-- Leonety WhatsApp Business multi-tenant integration.
-- Safe to re-run. Additive/non-destructive.

alter table public.store_integrations
  add column if not exists connected_at timestamptz,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.store_integrations
  drop constraint if exists store_integrations_provider_check;

alter table public.store_integrations
  add constraint store_integrations_provider_check
  check (provider in ('woocommerce', 'shopify', 'opencart', 'google_merchant', 'whatsapp_business', 'iss_pos'));

create index if not exists store_integrations_whatsapp_phone_idx
  on public.store_integrations(provider, merchant_id)
  where provider = 'whatsapp_business' and merchant_id is not null;

create index if not exists store_integrations_whatsapp_waba_idx
  on public.store_integrations(provider, external_account_id)
  where provider = 'whatsapp_business' and external_account_id is not null;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_integration_id uuid not null references public.store_integrations(id) on delete cascade,
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_integration_id, provider_event_id)
);

create index if not exists whatsapp_webhook_events_company_idx
  on public.whatsapp_webhook_events(company_id, created_at desc);

create index if not exists whatsapp_webhook_events_connection_idx
  on public.whatsapp_webhook_events(store_integration_id, created_at desc);

alter table public.whatsapp_webhook_events enable row level security;

drop policy if exists whatsapp_webhook_events_owner_select on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_owner_select
  on public.whatsapp_webhook_events
  for select
  using (
    exists (
      select 1
      from public.companies c
      where c.id = whatsapp_webhook_events.company_id
        and c.owner_id = auth.uid()
    )
  );

do $$
begin
  if to_regclass('public.clients') is not null then
    alter table public.clients
      add column if not exists source text,
      add column if not exists external_id text,
      add column if not exists first_contact_at timestamptz,
      add column if not exists import_metadata jsonb not null default '{}'::jsonb;

    create index if not exists clients_company_source_external_idx
      on public.clients(company_id, source, external_id)
      where source is not null and external_id is not null;
  end if;
end $$;

-- ============================================================================
-- Contracts
-- ============================================================================

-- Leonety AI Contract Builder.
-- Idempotent, additive and non-destructive. Execute manually in Supabase SQL editor.

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  reference text not null,
  template_type text not null,
  language text not null,
  title text not null,
  status text not null default 'draft',
  effective_date date,
  party_a_snapshot jsonb not null default '{}'::jsonb,
  party_b_snapshot jsonb not null default '{}'::jsonb,
  terms_snapshot jsonb not null default '{}'::jsonb,
  generated_document jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  archived_at timestamptz,
  constraint contracts_status_check check (status in ('draft', 'finalized', 'archived')),
  constraint contracts_language_check check (language in ('en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr')),
  constraint contracts_template_type_check check (
    template_type in (
      'general_service',
      'website_development',
      'website_maintenance',
      'nda',
      'contractor',
      'software_development',
      'goods_sale',
      'custom'
    )
  )
);

create unique index if not exists contracts_company_reference_unique
  on public.contracts(company_id, reference);

create index if not exists contracts_company_updated_idx
  on public.contracts(company_id, updated_at desc);

create index if not exists contracts_company_status_idx
  on public.contracts(company_id, status);

create index if not exists contracts_company_client_idx
  on public.contracts(company_id, client_id)
  where client_id is not null;

create table if not exists public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version_kind text not null,
  title text not null,
  generated_document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint contract_versions_kind_check check (version_kind in ('draft', 'finalized', 'manual_version'))
);

create index if not exists contract_versions_contract_created_idx
  on public.contract_versions(contract_id, created_at desc);

create index if not exists contract_versions_company_created_idx
  on public.contract_versions(company_id, created_at desc);

create or replace function public.set_contract_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'archived' and old.status is distinct from 'archived' then
    new.archived_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_contract_updated_at on public.contracts;
create trigger trg_set_contract_updated_at
before update on public.contracts
for each row
execute function public.set_contract_updated_at();

alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;

drop policy if exists contracts_owner_select on public.contracts;
create policy contracts_owner_select
  on public.contracts
  for select
  using (
    exists (
      select 1
      from public.companies c
      where c.id = contracts.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists contracts_owner_insert on public.contracts;
create policy contracts_owner_insert
  on public.contracts
  for insert
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = contracts.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists contracts_owner_update on public.contracts;
create policy contracts_owner_update
  on public.contracts
  for update
  using (
    exists (
      select 1
      from public.companies c
      where c.id = contracts.company_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = contracts.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists contract_versions_owner_select on public.contract_versions;
create policy contract_versions_owner_select
  on public.contract_versions
  for select
  using (
    exists (
      select 1
      from public.companies c
      where c.id = contract_versions.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists contract_versions_owner_insert on public.contract_versions;
create policy contract_versions_owner_insert
  on public.contract_versions
  for insert
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = contract_versions.company_id
        and c.owner_id = auth.uid()
    )
  );

-- Verification SQL:
-- select table_name from information_schema.tables where table_schema = 'public' and table_name in ('contracts', 'contract_versions');
-- select indexname from pg_indexes where schemaname = 'public' and tablename in ('contracts', 'contract_versions');
-- select tablename, policyname from pg_policies where schemaname = 'public' and tablename in ('contracts', 'contract_versions');

-- Rollback notes:
-- To disable the feature without deleting data, remove the /contracts navigation entry in code.
-- Dropping these tables would delete contracts and is intentionally not included here.

-- ============================================================================
-- Marketplace channels and accounting metadata
-- ============================================================================

-- Leonety marketplace channels and publication preferences.
-- Safe to re-run. Non-destructive for data: expands provider/channel allowlists
-- and adds optional mapping/preference metadata used by product publishing UI.

alter table public.store_integrations
  drop constraint if exists store_integrations_provider_check;

alter table public.store_integrations
  add constraint store_integrations_provider_check
  check (
    provider in (
      'woocommerce',
      'shopify',
      'opencart',
      'google_merchant',
      'whatsapp_business',
      'iss_pos',
      'ebay',
      'amazon_marketplace',
      'kleinanzeigen',
      'olx',
      'uber_eats',
      'just_eat_takeaway',
      'glovo'
    )
  );

do $$
begin
  if to_regclass('public.product_syncs') is not null then
    alter table public.product_syncs
      drop constraint if exists product_syncs_channel_check;

    alter table public.product_syncs
      add constraint product_syncs_channel_check
      check (
        channel in (
          'woocommerce',
          'shopify',
          'opencart',
          'google_merchant',
          'facebook_instagram',
          'tiktok_shop',
          'iss_pos',
          'ebay',
          'amazon_marketplace',
          'kleinanzeigen',
          'olx',
          'uber_eats',
          'just_eat_takeaway',
          'glovo'
        )
      );
  end if;
end $$;

create index if not exists store_integrations_food_marketplace_idx
  on public.store_integrations(company_id, provider, merchant_id)
  where provider in (
    'ebay',
    'amazon_marketplace',
    'kleinanzeigen',
    'olx',
    'uber_eats',
    'just_eat_takeaway',
    'glovo'
  );

create table if not exists public.product_channel_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  provider text not null,
  publish_requested boolean not null default false,
  overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_channel_preferences_provider_check
    check (
      provider in (
        'woocommerce',
        'shopify',
        'opencart',
        'google_merchant',
        'facebook_instagram',
        'tiktok_shop',
        'iss_pos',
        'ebay',
        'amazon_marketplace',
        'kleinanzeigen',
        'olx',
        'uber_eats',
        'just_eat_takeaway',
        'glovo'
      )
    )
);

create unique index if not exists product_channel_preferences_unique
  on public.product_channel_preferences(company_id, product_id, provider);

create index if not exists product_channel_preferences_company_product_idx
  on public.product_channel_preferences(company_id, product_id);

alter table public.product_channel_preferences enable row level security;

drop policy if exists product_channel_preferences_owner_select on public.product_channel_preferences;
create policy product_channel_preferences_owner_select
  on public.product_channel_preferences
  for select
  using (
    exists (
      select 1
      from public.companies c
      where c.id = product_channel_preferences.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_channel_preferences_owner_insert on public.product_channel_preferences;
create policy product_channel_preferences_owner_insert
  on public.product_channel_preferences
  for insert
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = product_channel_preferences.company_id
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_channel_preferences_owner_update on public.product_channel_preferences;
create policy product_channel_preferences_owner_update
  on public.product_channel_preferences
  for update
  using (
    exists (
      select 1
      from public.companies c
      where c.id = product_channel_preferences.company_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = product_channel_preferences.company_id
        and c.owner_id = auth.uid()
    )
  );

alter table public.incomes
  add column if not exists title text;

alter table public.expenses
  add column if not exists title text;

alter table public.invoices
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

create index if not exists invoices_company_contract_idx
  on public.invoices(company_id, contract_id)
  where contract_id is not null;

-- Verification:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname in ('store_integrations_provider_check', 'product_syncs_channel_check', 'product_channel_preferences_provider_check');
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public' and table_name = 'product_channel_preferences';
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and (
--     (table_name in ('incomes', 'expenses') and column_name = 'title')
--     or (table_name = 'invoices' and column_name = 'contract_id')
--   );
--
-- Rollback note:
-- To disable these UI features without deleting data, remove the related routes/buttons in code.
-- Dropping product_channel_preferences or new columns is intentionally omitted because
-- it would discard publication choices, transaction titles or contract-invoice links.

-- Leonety inventory accounting links.
-- Additive and safe to re-run. Does not delete or rewrite existing movements.

alter table public.stock_movements
  add column if not exists unit_purchase_cost numeric(12,2) check (unit_purchase_cost is null or unit_purchase_cost >= 0),
  add column if not exists selling_price numeric(12,2) check (selling_price is null or selling_price >= 0),
  add column if not exists previous_quantity numeric(14,3),
  add column if not exists resulting_quantity numeric(14,3),
  add column if not exists linked_expense_id bigint references public.expenses(id) on delete set null,
  add column if not exists source text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists stock_movements_company_product_created_idx
  on public.stock_movements(company_id, product_id, created_at desc);

create index if not exists stock_movements_linked_expense_idx
  on public.stock_movements(company_id, linked_expense_id)
  where linked_expense_id is not null;

create or replace function public.record_stock_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text,
  p_reference text default null,
  p_notes text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric;
  quantity_change numeric;
  movement_row public.stock_movements%rowtype;
begin
  if p_type not in ('stock_in', 'stock_out', 'adjustment', 'return') then
    raise exception 'Invalid stock movement type' using errcode = 'P0001';
  end if;

  if p_quantity is null or (p_type <> 'adjustment' and p_quantity <= 0) or (p_type = 'adjustment' and p_quantity < 0) then
    raise exception 'Quantity must be valid for the movement type' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reason is required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = p_company_id and c.owner_id = auth.uid()
  ) then
    raise exception 'Workspace access denied' using errcode = 'P0001';
  end if;

  select current_stock
  into current_quantity
  from public.products
  where id = p_product_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = 'P0001';
  end if;

  quantity_change := case
    when p_type in ('stock_in', 'return') then p_quantity
    when p_type = 'stock_out' then -p_quantity
    when p_type = 'adjustment' then p_quantity - current_quantity
  end;

  if current_quantity + quantity_change < 0 then
    raise exception 'Insufficient stock' using errcode = 'P0001';
  end if;

  update public.products
  set
    current_stock = current_quantity + quantity_change,
    updated_at = now()
  where id = p_product_id and company_id = p_company_id;

  insert into public.stock_movements (
    company_id,
    product_id,
    type,
    quantity,
    reason,
    reference,
    notes,
    previous_quantity,
    resulting_quantity,
    created_by
  )
  values (
    p_company_id,
    p_product_id,
    p_type,
    p_quantity,
    btrim(p_reason),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''),
    current_quantity,
    current_quantity + quantity_change,
    auth.uid()
  )
  returning * into movement_row;

  return movement_row;
end;
$$;

-- Verification:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'stock_movements'
--   and column_name in ('unit_purchase_cost', 'selling_price', 'previous_quantity', 'resulting_quantity', 'linked_expense_id', 'source', 'created_by');
--
-- Rollback note:
-- Leave columns in place to preserve audit history. Removing them would discard linkage metadata.

-- Additive accounting UX fields for traceable transaction metadata.
-- Run manually in Supabase after reviewing the verification queries below.

do $$
declare
  clients_id_type text;
  invoices_id_type text;
begin
  select data_type into clients_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'id';

  select data_type into invoices_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'invoices' and column_name = 'id';

  if clients_id_type is distinct from 'uuid' then
    raise exception 'Expected public.clients.id to be uuid, found %', coalesce(clients_id_type, 'missing');
  end if;

  if invoices_id_type is distinct from 'uuid' then
    raise exception 'Expected public.invoices.id to be uuid, found %', coalesce(invoices_id_type, 'missing');
  end if;
end
$$;

alter table public.incomes
  add column if not exists reference text,
  add column if not exists note text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

alter table public.expenses
  add column if not exists reference text,
  add column if not exists note text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

create index if not exists incomes_company_client_idx
  on public.incomes(company_id, client_id) where client_id is not null;
create index if not exists incomes_company_invoice_idx
  on public.incomes(company_id, invoice_id) where invoice_id is not null;
create index if not exists expenses_company_client_idx
  on public.expenses(company_id, client_id) where client_id is not null;
create index if not exists expenses_company_invoice_idx
  on public.expenses(company_id, invoice_id) where invoice_id is not null;

-- Existing table RLS applies to these nullable columns. No new policy is needed.
-- Verification:
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('incomes', 'expenses', 'clients', 'invoices')
--   and column_name in ('id', 'reference', 'note', 'client_id', 'invoice_id', 'payment_method')
-- order by table_name, ordinal_position;
--
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public'
--   and indexname in (
--     'incomes_company_client_idx', 'incomes_company_invoice_idx',
--     'expenses_company_client_idx', 'expenses_company_invoice_idx'
--   );
--
-- Rollback notes (manual and data-destructive): remove the four indexes first, then
-- remove the five columns from each transaction table only after exporting their data.
-- No rollback SQL is executed automatically.

-- Additive Contract -> Invoice -> Income linkage and idempotent paid-invoice accounting.
-- Review and run manually in Supabase. No existing rows are deleted or rewritten.


do $$
declare
  relation_name text;
  id_type text;
begin
  foreach relation_name in array array['clients', 'contracts', 'invoices', 'incomes'] loop
    select c.data_type into id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = relation_name
      and c.column_name = 'id';

    if id_type is distinct from 'uuid' then
      raise exception 'Expected public.%.id to be uuid, found %', relation_name, coalesce(id_type, 'missing');
    end if;
  end loop;
end
$$;

alter table public.invoices
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

alter table public.incomes
  add column if not exists title text,
  add column if not exists reference text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

create index if not exists invoices_company_contract_idx
  on public.invoices(company_id, contract_id)
  where contract_id is not null;

create index if not exists incomes_company_client_idx
  on public.incomes(company_id, client_id)
  where client_id is not null;

create unique index if not exists contracts_company_id_id_unique
  on public.contracts(company_id, id);

create unique index if not exists invoices_company_id_id_unique
  on public.invoices(company_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_contract_id_fkey') then
    alter table public.invoices
      add constraint invoices_contract_id_fkey
      foreign key (contract_id)
      references public.contracts(id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'incomes_invoice_id_fkey') then
    alter table public.incomes
      add constraint incomes_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_company_contract_fkey') then
    alter table public.invoices
      add constraint invoices_company_contract_fkey
      foreign key (company_id, contract_id)
      references public.contracts(company_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'incomes_company_invoice_fkey') then
    alter table public.incomes
      add constraint incomes_company_invoice_fkey
      foreign key (company_id, invoice_id)
      references public.invoices(company_id, id)
      not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.incomes
    where invoice_id is not null
    group by company_id, invoice_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate invoice-linked incomes exist; review them before creating the uniqueness index.';
  end if;
end
$$;

create unique index if not exists incomes_one_per_invoice_idx
  on public.incomes(company_id, invoice_id)
  where invoice_id is not null;

create or replace function public.enforce_invoice_contract_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  contract_client_id uuid;
begin
  if new.contract_id is null then
    return new;
  end if;

  select client_id
  into contract_client_id
  from public.contracts
  where id = new.contract_id
    and company_id = new.company_id;

  if not found then
    raise exception 'Contract not found in invoice workspace' using errcode = '23503';
  end if;

  if contract_client_id is not null and new.client_id is distinct from contract_client_id then
    raise exception 'Invoice client must match contract client' using errcode = '23514';
  end if;

  return new;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_invoice_contract_scope_trigger') then
    create trigger enforce_invoice_contract_scope_trigger
      before insert or update of company_id, contract_id, client_id
      on public.invoices
      for each row
      execute function public.enforce_invoice_contract_scope();
  end if;
end
$$;

create or replace function public.record_paid_invoice_income(
  p_invoice_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
  paid_total numeric;
  payment_method_value text;
  income_id uuid;
  legacy_income_count integer;
begin
  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found or access denied' using errcode = '42501';
  end if;

  if invoice_row.status <> 'paid' then
    raise exception 'Invoice is not marked paid' using errcode = '23514';
  end if;

  select
    coalesce(sum(amount), 0),
    case when count(distinct method) = 1 then min(method) else null end
  into paid_total, payment_method_value
  from public.invoice_payments
  where invoice_id = invoice_row.id
    and company_id = invoice_row.company_id;

  if round(paid_total, 2) <> round(invoice_row.total, 2) then
    raise exception 'Payment allocations do not equal the invoice total' using errcode = '23514';
  end if;

  select count(*), (array_agg(id order by id))[1]
  into legacy_income_count, income_id
  from public.incomes
  where company_id = invoice_row.company_id
    and invoice_id is null
    and category = 'Invoice Payment'
    and description = 'Invoice ' || invoice_row.invoice_number || ' paid'
    and round(amount, 2) = round(invoice_row.total, 2)
    and currency = invoice_row.currency;

  if legacy_income_count = 1 then
    update public.incomes
    set
      invoice_id = invoice_row.id,
      client_id = invoice_row.client_id,
      reference = invoice_row.invoice_number,
      payment_method = payment_method_value
    where id = income_id;
  end if;

  insert into public.incomes (
    company_id,
    user_id,
    title,
    description,
    category,
    amount,
    currency,
    date,
    client_id,
    invoice_id,
    reference,
    payment_method
  ) values (
    invoice_row.company_id,
    auth.uid(),
    coalesce(nullif(btrim(p_title), ''), invoice_row.invoice_number),
    'Invoice ' || invoice_row.invoice_number || ' paid',
    'Invoice Payment',
    invoice_row.total,
    invoice_row.currency,
    invoice_row.issue_date,
    invoice_row.client_id,
    invoice_row.id,
    invoice_row.invoice_number,
    payment_method_value
  )
  on conflict (company_id, invoice_id) where invoice_id is not null
  do update set
    amount = excluded.amount,
    currency = excluded.currency,
    date = excluded.date,
    client_id = excluded.client_id,
    reference = excluded.reference,
    payment_method = excluded.payment_method,
    description = excluded.description
  returning id into income_id;

  return income_id;
end
$$;

revoke all on function public.record_paid_invoice_income(uuid, text) from public;
grant execute on function public.record_paid_invoice_income(uuid, text) to authenticated;


-- Verification (read-only):
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('contracts', 'invoices', 'incomes', 'invoice_payments')
--   and column_name in ('id', 'company_id', 'client_id', 'contract_id', 'invoice_id');
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('invoices_company_contract_idx', 'incomes_one_per_invoice_idx');
--
-- Before validating the NOT VALID workspace constraints, both checks must return 0:
-- select count(*)
-- from public.invoices i
-- join public.contracts c on c.id = i.contract_id
-- where i.contract_id is not null and i.company_id <> c.company_id;
--
-- select count(*)
-- from public.incomes x
-- join public.invoices i on i.id = x.invoice_id
-- where x.invoice_id is not null and x.company_id <> i.company_id;
--
-- After both checks return 0, validate manually:
-- alter table public.invoices validate constraint invoices_company_contract_fkey;
-- alter table public.incomes validate constraint incomes_company_invoice_fkey;
--
-- select company_id, invoice_id, count(*)
-- from public.incomes
-- where invoice_id is not null
-- group by company_id, invoice_id
-- having count(*) > 1;

-- Rollback note: remove execute permission/function and indexes only after the app no
-- longer calls the RPC. New columns and relationship data should be retained.

-- ============================================================================
-- Workspace entitlement guard
-- ============================================================================

-- Server-side workspace limit enforcement and admin audit metadata.
-- Apply once after reviewing the current production schema. No data is deleted.

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists admin_audit_events_target_created_idx
  on public.admin_audit_events(target_user_id, created_at desc);

alter table public.admin_audit_events enable row level security;

-- No authenticated policy is intentional. Admin audit writes use the server-only
-- service role after the request has passed the existing admin_accounts check.
revoke all on public.admin_audit_events from anon, authenticated;

create or replace function public.enforce_workspace_entitlement_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_count integer;
  highest_plan_rank integer := 0;
  workspace_limit integer;
begin
  -- Serialize workspace creation per owner so parallel requests cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  if exists (
    select 1
    from public.admin_accounts admin_account
    where admin_account.user_id = new.owner_id
  ) then
    return new;
  end if;

  select coalesce(max(entitlement.plan_rank), 0)
  into highest_plan_rank
  from (
    select case access.tier
      when 'business' then 3
      when 'pro' then 2
      when 'starter' then 1
      else 0
    end as plan_rank
    from public.app_access access
    join public.companies company on company.id = access.company_id
    where company.owner_id = new.owner_id
      and access.active = true
      and (access.expires_at is null or access.expires_at > now())

    union all

    select case subscription.plan
      when 'business' then 3
      when 'pro' then 2
      when 'starter' then 1
      else 0
    end as plan_rank
    from public.billing_subscriptions subscription
    join public.companies company on company.id = subscription.company_id
    where company.owner_id = new.owner_id
      and subscription.status in ('trialing', 'active')
      and (subscription.current_period_end is null or subscription.current_period_end > now())
  ) entitlement;

  -- Mirrors the audited application definitions: Free 1, Starter 2,
  -- Pro/Business unlimited. Update both this guard and src/lib/billing/plans.ts
  -- together if product limits intentionally change later.
  workspace_limit := case highest_plan_rank
    when 0 then 1
    when 1 then 2
    else null
  end;

  if workspace_limit is null then
    return new;
  end if;

  select count(*)::integer
  into workspace_count
  from public.companies company
  where company.owner_id = new.owner_id;

  if workspace_count >= workspace_limit then
    raise exception using
      errcode = 'P0001',
      message = 'workspace_limit_reached';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_workspace_entitlement_limit() from public;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_workspace_entitlement_limit'
      and tgrelid = 'public.companies'::regclass
      and not tgisinternal
  ) then
    create trigger trg_enforce_workspace_entitlement_limit
      before insert on public.companies
      for each row
      execute function public.enforce_workspace_entitlement_limit();
  end if;
end;
$$;

-- Verification (read-only):
-- select tgname from pg_trigger
-- where tgrelid = 'public.companies'::regclass and not tgisinternal;
-- select action, metadata, created_at
-- from public.admin_audit_events
-- order by created_at desc
-- limit 20;

-- Rollback notes (manual, only if this feature must be reverted):
-- Removing the trigger/function restores the previous insert behavior. Keep
-- admin_audit_events to preserve audit history; do not delete its rows.

-- ============================================================================
-- Employee profiles and private documents
-- ============================================================================

-- Structured employee profile fields from the "Personalien neuer Mitarbeiter" form.
-- Additive only. Review and apply once before deploying the matching application code.

alter table public.employees add column if not exists first_name text;
alter table public.employees add column if not exists last_name text;
alter table public.employees add column if not exists tax_id text;
alter table public.employees add column if not exists tax_class text;
alter table public.employees add column if not exists social_security_number text;
alter table public.employees add column if not exists nationality text;
alter table public.employees add column if not exists street text;
alter table public.employees add column if not exists house_number text;
alter table public.employees add column if not exists postal_code text;
alter table public.employees add column if not exists city text;
alter table public.employees add column if not exists birth_date date;
alter table public.employees add column if not exists birth_place text;
alter table public.employees add column if not exists birth_country text;
alter table public.employees add column if not exists health_insurance_provider text;
alter table public.employees add column if not exists employment_start_date date;
alter table public.employees add column if not exists is_permanent boolean not null default true;
alter table public.employees add column if not exists fixed_term_end_date date;
alter table public.employees add column if not exists minijob_flat_tax_2_percent boolean not null default false;
alter table public.employees add column if not exists pension_insurance_exemption boolean not null default false;
alter table public.employees add column if not exists hours_per_week numeric(6,2);
alter table public.employees add column if not exists compensation_type text;
alter table public.employees add column if not exists hourly_wage numeric(12,2);
alter table public.employees add column if not exists fixed_salary numeric(12,2);
alter table public.employees add column if not exists compensation_currency text;
alter table public.employees add column if not exists annual_vacation_days numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_employment_term_check') then
    alter table public.employees add constraint employees_employment_term_check
      check ((is_permanent and fixed_term_end_date is null) or (not is_permanent and fixed_term_end_date is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_minijob_options_check') then
    alter table public.employees add constraint employees_minijob_options_check
      check (employment_type = 'minijob' or (not minijob_flat_tax_2_percent and not pension_insurance_exemption));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_compensation_check') then
    alter table public.employees add constraint employees_compensation_check check (
      (compensation_type is null and hourly_wage is null and fixed_salary is null)
      or (compensation_type = 'hourly' and hourly_wage is not null and hourly_wage >= 0 and fixed_salary is null)
      or (compensation_type = 'fixed' and fixed_salary is not null and fixed_salary >= 0 and hourly_wage is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_hours_vacation_check') then
    alter table public.employees add constraint employees_hours_vacation_check
      check ((hours_per_week is null or hours_per_week >= 0) and (annual_vacation_days is null or annual_vacation_days >= 0));
  end if;
end $$;

create index if not exists employees_company_start_date_idx
  on public.employees(company_id, employment_start_date desc nulls last);

-- Existing employees RLS remains enabled and unchanged. Verify before deployment:
-- select relrowsecurity from pg_class where oid = 'public.employees'::regclass;
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'employees';
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'employees' order by ordinal_position;

-- Rollback note: leave the nullable profile columns in place to avoid data loss.
-- Constraints and index may be removed manually only after confirming the app no longer uses them.

-- Country-aware extension for the existing employees table.
-- Additive and idempotent. Apply manually after reviewing the current employees RLS policies.

alter table public.employees
  add column if not exists country_code text;

alter table public.employees
  add column if not exists country_profile jsonb not null
  default '{"version": 1, "modules": {}}'::jsonb;

update public.employees
set country_profile = '{"version": 1, "modules": {}}'::jsonb
where country_profile is null;

alter table public.employees
  alter column country_profile set default '{"version": 1, "modules": {}}'::jsonb,
  alter column country_profile set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_country_code_check'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_country_code_check
      check (country_code is null or country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_country_profile_object_check'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_country_profile_object_check
      check (
        jsonb_typeof(country_profile) = 'object'
        and country_profile ->> 'version' = '1'
        and jsonb_typeof(country_profile -> 'modules') = 'object'
      );
  end if;
end $$;

create index if not exists employees_company_country_idx
  on public.employees(company_id, country_code)
  where country_code is not null;

comment on column public.employees.country_code is
  'ISO 3166-1 alpha-2 country code controlling country-specific employee profile sections.';

comment on column public.employees.country_profile is
  'Versioned object with per-country modules reserved for validated optional attributes that do not justify universal columns.';

-- Verification queries (read-only):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'employees'
--   and column_name in ('country_code', 'country_profile')
-- order by column_name;
--
-- select relrowsecurity
-- from pg_class
-- where oid = 'public.employees'::regclass;
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'employees'
-- order by policyname;

-- Rollback note:
-- Do not drop these columns after production data is written. A rollback should first deploy
-- application code that no longer reads them, then archive/export country_profile values.

-- Private, workspace-isolated employee document metadata and Storage bucket.
-- Additive/idempotent. Review and execute manually after employee profile migrations.

create table if not exists public.employee_document_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_type text not null,
  name text not null,
  country_code text,
  job_role text,
  is_required boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint employee_document_requirements_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint employee_document_requirements_type_unique unique (employee_id, document_type)
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requirement_id uuid references public.employee_document_requirements(id) on delete set null,
  document_type text not null,
  display_name text not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  issue_date date,
  expiration_date date,
  document_reference text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_documents_dates_check check (expiration_date is null or issue_date is null or expiration_date >= issue_date),
  constraint employee_documents_type_unique unique (employee_id, document_type)
);

create table if not exists public.employee_document_settings (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  has_driving_licence boolean,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists employee_documents_company_employee_idx on public.employee_documents(company_id, employee_id, updated_at desc);
create index if not exists employee_documents_expiration_idx on public.employee_documents(company_id, expiration_date) where expiration_date is not null;
create index if not exists employee_document_requirements_employee_idx on public.employee_document_requirements(company_id, employee_id);

alter table public.employee_documents enable row level security;
alter table public.employee_document_requirements enable row level security;
alter table public.employee_document_settings enable row level security;

do $$
declare
  table_name text;
  owner_expression text;
begin
  foreach table_name in array array['employee_documents', 'employee_document_requirements', 'employee_document_settings'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = table_name || '_owner_all') then
      owner_expression := format(
        'exists (select 1 from public.companies c where c.id = %1$I.company_id and c.owner_id = auth.uid()) and exists (select 1 from public.employees e where e.id = %1$I.employee_id and e.company_id = %1$I.company_id)',
        table_name
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (%s) with check (%s)',
        table_name || '_owner_all', table_name, owner_expression, owner_expression
      );
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_select') then
    create policy employee_documents_storage_owner_select on storage.objects for select to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_insert') then
    create policy employee_documents_storage_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_update') then
    create policy employee_documents_storage_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()))
    with check (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'employee_documents_storage_owner_delete') then
    create policy employee_documents_storage_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'employee-documents' and exists (select 1 from public.companies c where c.id::text = (storage.foldername(name))[1] and c.owner_id = auth.uid()));
  end if;
end $$;

-- Read-only verification after manual execution:
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'employee-documents';
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' and tablename like 'employee_document%';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'employee_documents_storage%';
-- select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where conrelid in ('public.employee_documents'::regclass, 'public.employee_document_requirements'::regclass, 'public.employee_document_settings'::regclass);

-- Rollback: deploy code that no longer reads these tables first, export metadata/files, then remove policies,
-- bucket objects, bucket and tables manually. Never drop these objects after production uploads without an export.

-- The final stock movement implementation is defined by the accounting-link
-- section above. Restore the grants that originally preceded that replacement.
revoke all on function public.record_stock_movement(uuid, uuid, text, numeric, text, text, text) from public;
grant execute on function public.record_stock_movement(uuid, uuid, text, numeric, text, text, text) to authenticated;

commit;

