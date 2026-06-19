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
  woo_product_id bigint,
  last_sync_at timestamptz,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'synced', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id)
);

create index if not exists product_syncs_company_idx
  on public.product_syncs(company_id);

create index if not exists product_syncs_product_idx
  on public.product_syncs(product_id);

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
