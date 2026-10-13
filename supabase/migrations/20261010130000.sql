-- Add server-only Google mailbox connection metadata.
-- Gmail remains the source of message content; this table never stores messages.
-- Apply only after read-only production inspection confirms the companies schema
-- and mailbox_connections is absent or has this exact compatible structure.

begin;

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception 'Prerequisite missing: public.companies';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = 'id' and udt_name = 'uuid'
  ) then
    raise exception 'Prerequisite mismatch: public.companies.id must be uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = 'owner_id' and udt_name = 'uuid'
  ) then
    raise exception 'Prerequisite mismatch: public.companies.owner_id must be uuid';
  end if;
end;
$$;

create table if not exists public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  provider_account_email text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}'::text[],
  status text not null default 'connected',
  history_id text,
  last_synced_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailbox_connections_provider_check
    check (provider in ('google')),
  constraint mailbox_connections_account_email_check
    check (char_length(btrim(provider_account_email)) between 3 and 320),
  constraint mailbox_connections_access_token_encrypted_check
    check (access_token_encrypted like 'enc:v1:%'),
  constraint mailbox_connections_refresh_token_encrypted_check
    check (refresh_token_encrypted like 'enc:v1:%'),
  constraint mailbox_connections_scopes_check
    check (granted_scopes @> array['https://www.googleapis.com/auth/gmail.modify']::text[]),
  constraint mailbox_connections_status_check
    check (status in ('connected', 'reconnect_required', 'error', 'disabled')),
  constraint mailbox_connections_error_code_length_check
    check (last_error_code is null or char_length(last_error_code) <= 100)
);

create unique index if not exists mailbox_connections_company_provider_account_unique
  on public.mailbox_connections(company_id, provider, lower(btrim(provider_account_email)));

create index if not exists mailbox_connections_company_status_idx
  on public.mailbox_connections(company_id, status);

alter table public.mailbox_connections enable row level security;

-- Defense-in-depth owner policies. Browser roles receive no table privileges;
-- application APIs must authenticate and verify company ownership before using
-- the server-only service client.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mailbox_connections'
      and policyname = 'Owners select mailbox connections'
  ) then
    create policy "Owners select mailbox connections"
      on public.mailbox_connections for select to authenticated
      using (exists (
        select 1 from public.companies c
        where c.id = mailbox_connections.company_id and c.owner_id = auth.uid()
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mailbox_connections'
      and policyname = 'Owners insert mailbox connections'
  ) then
    create policy "Owners insert mailbox connections"
      on public.mailbox_connections for insert to authenticated
      with check (exists (
        select 1 from public.companies c
        where c.id = mailbox_connections.company_id and c.owner_id = auth.uid()
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mailbox_connections'
      and policyname = 'Owners update mailbox connections'
  ) then
    create policy "Owners update mailbox connections"
      on public.mailbox_connections for update to authenticated
      using (exists (
        select 1 from public.companies c
        where c.id = mailbox_connections.company_id and c.owner_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.companies c
        where c.id = mailbox_connections.company_id and c.owner_id = auth.uid()
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mailbox_connections'
      and policyname = 'Owners delete mailbox connections'
  ) then
    create policy "Owners delete mailbox connections"
      on public.mailbox_connections for delete to authenticated
      using (exists (
        select 1 from public.companies c
        where c.id = mailbox_connections.company_id and c.owner_id = auth.uid()
      ));
  end if;
end;
$$;

revoke all on table public.mailbox_connections from anon, authenticated;
grant all on table public.mailbox_connections to service_role;

create or replace function public.set_mailbox_connection_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.provider_account_email := lower(btrim(new.provider_account_email));
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_mailbox_connection_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_set_mailbox_connection_updated_at'
      and tgrelid = 'public.mailbox_connections'::regclass
      and not tgisinternal
  ) then
    create trigger trg_set_mailbox_connection_updated_at
      before insert or update on public.mailbox_connections
      for each row execute function public.set_mailbox_connection_updated_at();
  end if;
end;
$$;

comment on table public.mailbox_connections is
  'Server-only workspace mailbox OAuth connections; Gmail message content remains at the provider.';
comment on column public.mailbox_connections.access_token_encrypted is
  'AES-256-GCM value produced by the Leonety server credential encryption helper.';
comment on column public.mailbox_connections.refresh_token_encrypted is
  'AES-256-GCM value produced by the Leonety server credential encryption helper.';
comment on column public.mailbox_connections.history_id is
  'Opaque Gmail history cursor stored as text to avoid JavaScript integer precision loss.';

commit;
