-- Reconcile workspace addon activation persistence without masking schema drift.
-- Existing rows are preserved. An incompatible existing table aborts this migration.

do $migration$
declare
  activation_table regclass := to_regclass('public.workspace_addon_activations');
  actual_column_count integer;
  actual_constraint_count integer;
begin
  if activation_table is null then
    create table public.workspace_addon_activations (
      company_id uuid not null references public.companies(id) on delete cascade,
      addon_id text not null,
      enabled boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users(id) on delete set null,
      constraint workspace_addon_activations_pkey primary key (company_id, addon_id),
      constraint workspace_addon_activations_addon_id_check
        check (addon_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    );
    activation_table := 'public.workspace_addon_activations'::regclass;
  end if;

  select count(*)
  into actual_column_count
  from pg_catalog.pg_attribute a
  where a.attrelid = activation_table
    and a.attnum > 0
    and not a.attisdropped;

  if actual_column_count <> 6
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'company_id' and udt_name = 'uuid'
        and is_nullable = 'NO' and column_default is null
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'addon_id' and udt_name = 'text'
        and is_nullable = 'NO' and column_default is null
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'enabled' and udt_name = 'bool'
        and is_nullable = 'NO' and column_default = 'false'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'created_at' and udt_name = 'timestamptz'
        and is_nullable = 'NO' and column_default = 'now()'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'updated_at' and udt_name = 'timestamptz'
        and is_nullable = 'NO' and column_default = 'now()'
    )
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'workspace_addon_activations'
        and column_name = 'updated_by' and udt_name = 'uuid'
        and is_nullable = 'YES' and column_default is null
    ) then
    raise exception 'workspace_addon_activations schema mismatch; inspect production metadata before reconciling';
  end if;

  select count(*)
  into actual_constraint_count
  from pg_catalog.pg_constraint c
  where c.conrelid = activation_table;

  if actual_constraint_count <> 4
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = activation_table
        and c.conname = 'workspace_addon_activations_pkey'
        and c.contype = 'p'
        and pg_catalog.pg_get_constraintdef(c.oid, true) = 'PRIMARY KEY (company_id, addon_id)'
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = activation_table
        and c.conname = 'workspace_addon_activations_company_id_fkey'
        and c.contype = 'f'
        and pg_catalog.pg_get_constraintdef(c.oid, true) = 'FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE'
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = activation_table
        and c.conname = 'workspace_addon_activations_updated_by_fkey'
        and c.contype = 'f'
        and pg_catalog.pg_get_constraintdef(c.oid, true) = 'FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL'
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = activation_table
        and c.conname = 'workspace_addon_activations_addon_id_check'
        and c.contype = 'c'
        and pg_catalog.pg_get_constraintdef(c.oid, true) = $$CHECK (addon_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)$$
    ) then
    raise exception 'workspace_addon_activations constraints mismatch; inspect production metadata before reconciling';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'workspace_addon_activations'
      and p.policyname not in (
        'workspace_addon_activations_owner_select',
        'workspace_addon_activations_owner_insert',
        'workspace_addon_activations_owner_update'
      )
  ) then
    raise exception 'Unexpected workspace_addon_activations RLS policy found; review policy drift before reconciling';
  end if;
end;
$migration$;

alter table public.workspace_addon_activations enable row level security;

drop policy if exists workspace_addon_activations_owner_select on public.workspace_addon_activations;
create policy workspace_addon_activations_owner_select
  on public.workspace_addon_activations
  for select to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = workspace_addon_activations.company_id
        and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists workspace_addon_activations_owner_insert on public.workspace_addon_activations;
create policy workspace_addon_activations_owner_insert
  on public.workspace_addon_activations
  for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.companies c
      where c.id = workspace_addon_activations.company_id
        and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists workspace_addon_activations_owner_update on public.workspace_addon_activations;
create policy workspace_addon_activations_owner_update
  on public.workspace_addon_activations
  for update to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = workspace_addon_activations.company_id
        and c.owner_id = (select auth.uid())
    )
  )
  with check (
    updated_by = (select auth.uid())
    and exists (
      select 1 from public.companies c
      where c.id = workspace_addon_activations.company_id
        and c.owner_id = (select auth.uid())
    )
  );

create or replace function public.set_workspace_addon_activation_audit()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.addon_id is distinct from old.addon_id
  ) then
    raise exception 'Workspace addon activation identity is immutable'
      using errcode = '55000';
  end if;

  new.updated_at := pg_catalog.now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

drop trigger if exists workspace_addon_activations_set_audit on public.workspace_addon_activations;
create trigger workspace_addon_activations_set_audit
before insert or update on public.workspace_addon_activations
for each row
execute function public.set_workspace_addon_activation_audit();

-- Match the authenticated API's upsert payload while preventing identity changes.
revoke all on table public.workspace_addon_activations from anon, service_role;
grant select on table public.workspace_addon_activations to authenticated;
grant insert (company_id, addon_id, enabled) on table public.workspace_addon_activations to authenticated;
grant update (company_id, addon_id, enabled) on table public.workspace_addon_activations to authenticated;

comment on table public.workspace_addon_activations is
  'Workspace-scoped opt-in state for built-in addons; absence or enabled=false means disabled.';

-- Post-deployment verification (run manually after review and approval):
-- select c.relname, c.relrowsecurity, c.relforcerowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'workspace_addon_activations';
-- select policyname, cmd, roles, qual, with_check from pg_policies
-- where schemaname = 'public' and tablename = 'workspace_addon_activations';
-- select has_table_privilege('anon', 'public.workspace_addon_activations', 'SELECT') as anon_select,
--        has_table_privilege('authenticated', 'public.workspace_addon_activations', 'SELECT') as auth_select,
--        has_column_privilege('authenticated', 'public.workspace_addon_activations', 'company_id', 'UPDATE') as auth_company_id_update,
--        has_column_privilege('authenticated', 'public.workspace_addon_activations', 'addon_id', 'UPDATE') as auth_addon_id_update,
--        has_column_privilege('authenticated', 'public.workspace_addon_activations', 'enabled', 'UPDATE') as auth_enabled_update;
