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
