-- Secure the Leonety operator allowlist before exposing server-side auth user data.
-- This migration is additive/idempotent and does not modify auth.users.

begin;

do $$
begin
  if to_regclass('public.admin_accounts') is null then
    raise exception 'public.admin_accounts must exist before applying this security migration';
  end if;
end
$$;

alter table public.admin_accounts enable row level security;

-- Operator authorization is resolved only by authenticated Leonety server routes
-- using the service-role client. Browser roles require no direct table access.
revoke all privileges on table public.admin_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_accounts to service_role;

comment on table public.admin_accounts is
  'Server-only allowlist for Leonety platform administrators; browser roles have no direct privileges.';

commit;

-- Read-only verification after manual application:
-- select c.relrowsecurity, c.relforcerowsecurity
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'admin_accounts';
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'admin_accounts'
-- order by grantee, privilege_type;
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'admin_accounts'
-- order by policyname;

-- Rollback note:
-- Do not restore anon/authenticated privileges. If this migration reveals an
-- undocumented browser dependency, repair that flow through an authorized server
-- route rather than reopening direct access to the operator allowlist.
