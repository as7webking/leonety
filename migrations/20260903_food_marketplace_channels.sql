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
