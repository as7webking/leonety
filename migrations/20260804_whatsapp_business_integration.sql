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
