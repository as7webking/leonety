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
