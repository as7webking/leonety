-- Edit 1: extend the pending Google mailbox model for Microsoft Graph and
-- TLS-only IMAP/SMTP, retain secrets encrypted, and enforce slot limits atomically.
-- Prerequisite: manually review/apply 20261010130000_google_mailbox_connections.sql
-- after read-only verification of the live companies/mailbox_connections schema.
-- This migration is not executed by the application.

begin;

do $$
begin
  if to_regclass('public.mailbox_connections') is null then
    raise exception 'Prerequisite missing: public.mailbox_connections; review 20261010130000_google_mailbox_connections.sql first';
  end if;
  if to_regclass('public.companies') is null then
    raise exception 'Prerequisite missing: public.companies';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mailbox_connections'
      and column_name = 'company_id' and udt_name = 'uuid'
  ) then
    raise exception 'Prerequisite mismatch: mailbox_connections.company_id must be uuid';
  end if;
end;
$$;

alter table public.mailbox_connections
  add column if not exists display_name text,
  add column if not exists provider_account_id text,
  add column if not exists credentials_encrypted text,
  add column if not exists last_successful_connection_at timestamptz;

alter table public.mailbox_connections
  alter column access_token_encrypted drop not null,
  alter column refresh_token_encrypted drop not null;

alter table public.mailbox_connections
  drop constraint if exists mailbox_connections_provider_check,
  drop constraint if exists mailbox_connections_access_token_encrypted_check,
  drop constraint if exists mailbox_connections_refresh_token_encrypted_check,
  drop constraint if exists mailbox_connections_scopes_check,
  drop constraint if exists mailbox_connections_provider_credentials_check,
  drop constraint if exists mailbox_connections_status_check;

alter table public.mailbox_connections
  add constraint mailbox_connections_provider_check
    check (provider in ('google', 'microsoft', 'imap')),
  add constraint mailbox_connections_access_token_encrypted_check
    check (access_token_encrypted is null or access_token_encrypted like 'enc:v1:%'),
  add constraint mailbox_connections_refresh_token_encrypted_check
    check (refresh_token_encrypted is null or refresh_token_encrypted like 'enc:v1:%'),
  add constraint mailbox_connections_credentials_encrypted_check
    check (credentials_encrypted is null or credentials_encrypted like 'enc:v1:%'),
  add constraint mailbox_connections_provider_credentials_check
    check (
      status = 'disabled'
      or
      (provider in ('google', 'microsoft') and access_token_encrypted is not null
        and refresh_token_encrypted is not null and credentials_encrypted is null)
      or
      (provider = 'imap' and access_token_encrypted is null
        and refresh_token_encrypted is null and credentials_encrypted is not null)
    ),
  add constraint mailbox_connections_status_check
    check (status in ('connected', 'reconnect_required', 'error', 'disabled', 'plan_restricted'));

create index if not exists mailbox_connections_company_created_idx
  on public.mailbox_connections(company_id, created_at, id);

-- The authenticated application verifies owner and entitlement before calling
-- these service-role-only functions. Advisory transaction locks serialize slot
-- allocation/re-activation per workspace so parallel requests cannot exceed plan.
create or replace function public.create_mailbox_connection_limited(
  p_company_id uuid,
  p_max_connections integer,
  p_provider text,
  p_account_email text,
  p_display_name text,
  p_provider_account_id text,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_access_token_expires_at timestamptz,
  p_granted_scopes text[],
  p_credentials_encrypted text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_existing uuid;
  v_existing_status text;
  v_count integer;
  v_email text := lower(btrim(p_account_email));
begin
  if p_max_connections not between 1 and 4 then
    raise exception using errcode = '22023', message = 'invalid_mailbox_limit';
  end if;
  if p_provider not in ('google', 'microsoft', 'imap') then
    raise exception using errcode = '22023', message = 'invalid_mailbox_provider';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 7319));

  select id, status into v_existing, v_existing_status
  from public.mailbox_connections
  where company_id = p_company_id and provider = p_provider
    and lower(btrim(provider_account_email)) = v_email
  for update;

  if v_existing is null or v_existing_status not in ('connected', 'reconnect_required', 'error') then
    select count(*) into v_count
    from public.mailbox_connections
    where company_id = p_company_id
      and status in ('connected', 'reconnect_required', 'error');
    if v_count >= p_max_connections then
      raise exception using errcode = 'P0001', message = 'mailbox_limit_reached';
    end if;
  end if;

  if v_existing is null then

    insert into public.mailbox_connections (
      company_id, provider, provider_account_email, display_name, provider_account_id,
      access_token_encrypted, refresh_token_encrypted, access_token_expires_at,
      granted_scopes, credentials_encrypted, status, last_successful_connection_at
    ) values (
      p_company_id, p_provider, v_email, nullif(btrim(p_display_name), ''),
      nullif(p_provider_account_id, ''), p_access_token_encrypted,
      p_refresh_token_encrypted, p_access_token_expires_at,
      coalesce(p_granted_scopes, '{}'::text[]), p_credentials_encrypted,
      'connected', now()
    ) returning id into v_id;
  else
    update public.mailbox_connections set
      display_name = nullif(btrim(p_display_name), ''),
      provider_account_id = nullif(p_provider_account_id, ''),
      access_token_encrypted = p_access_token_encrypted,
      refresh_token_encrypted = p_refresh_token_encrypted,
      access_token_expires_at = p_access_token_expires_at,
      granted_scopes = coalesce(p_granted_scopes, '{}'::text[]),
      credentials_encrypted = p_credentials_encrypted,
      status = 'connected', last_error_code = null,
      last_successful_connection_at = now()
    where id = v_existing returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.activate_mailbox_connection_limited(
  p_company_id uuid,
  p_connection_id uuid,
  p_max_connections integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_status text;
begin
  if p_max_connections not between 1 and 4 then
    raise exception using errcode = '22023', message = 'invalid_mailbox_limit';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text, 7319));
  select status into v_status from public.mailbox_connections
    where id = p_connection_id and company_id = p_company_id for update;
  if v_status is null then return false; end if;
  if v_status <> 'plan_restricted' then return true; end if;
  select count(*) into v_count from public.mailbox_connections
    where company_id = p_company_id
      and status in ('connected', 'reconnect_required', 'error');
  if v_count >= p_max_connections then
    raise exception using errcode = 'P0001', message = 'mailbox_limit_reached';
  end if;
  update public.mailbox_connections set status = 'connected', last_error_code = null
    where id = p_connection_id and company_id = p_company_id;
  return true;
end;
$$;

revoke all on function public.create_mailbox_connection_limited(uuid, integer, text, text, text, text, text, text, timestamptz, text[], text) from public, anon, authenticated;
revoke all on function public.activate_mailbox_connection_limited(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.create_mailbox_connection_limited(uuid, integer, text, text, text, text, text, text, timestamptz, text[], text) to service_role;
grant execute on function public.activate_mailbox_connection_limited(uuid, uuid, integer) to service_role;

comment on column public.mailbox_connections.credentials_encrypted is
  'AES-256-GCM encrypted provider-specific connection configuration; currently used only for TLS IMAP/SMTP credentials.';
comment on column public.mailbox_connections.status is
  'plan_restricted retains authorization but blocks mailbox access after a plan downgrade; no credential or mail data is deleted.';
comment on function public.create_mailbox_connection_limited(uuid, integer, text, text, text, text, text, text, timestamptz, text[], text) is
  'Atomic per-workspace mailbox slot allocation. Callable only by service_role after application owner/plan authorization.';

commit;
