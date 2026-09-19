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
