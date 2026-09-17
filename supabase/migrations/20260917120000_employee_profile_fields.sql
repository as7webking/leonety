-- Structured employee profile fields from the "Personalien neuer Mitarbeiter" form.
-- Additive only. Review and apply once before deploying the matching application code.

alter table public.employees add column if not exists first_name text;
alter table public.employees add column if not exists last_name text;
alter table public.employees add column if not exists tax_id text;
alter table public.employees add column if not exists tax_class text;
alter table public.employees add column if not exists social_security_number text;
alter table public.employees add column if not exists nationality text;
alter table public.employees add column if not exists street text;
alter table public.employees add column if not exists house_number text;
alter table public.employees add column if not exists postal_code text;
alter table public.employees add column if not exists city text;
alter table public.employees add column if not exists birth_date date;
alter table public.employees add column if not exists birth_place text;
alter table public.employees add column if not exists birth_country text;
alter table public.employees add column if not exists health_insurance_provider text;
alter table public.employees add column if not exists employment_start_date date;
alter table public.employees add column if not exists is_permanent boolean not null default true;
alter table public.employees add column if not exists fixed_term_end_date date;
alter table public.employees add column if not exists minijob_flat_tax_2_percent boolean not null default false;
alter table public.employees add column if not exists pension_insurance_exemption boolean not null default false;
alter table public.employees add column if not exists hours_per_week numeric(6,2);
alter table public.employees add column if not exists compensation_type text;
alter table public.employees add column if not exists hourly_wage numeric(12,2);
alter table public.employees add column if not exists fixed_salary numeric(12,2);
alter table public.employees add column if not exists compensation_currency text;
alter table public.employees add column if not exists annual_vacation_days numeric(5,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employees_employment_term_check') then
    alter table public.employees add constraint employees_employment_term_check
      check ((is_permanent and fixed_term_end_date is null) or (not is_permanent and fixed_term_end_date is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_minijob_options_check') then
    alter table public.employees add constraint employees_minijob_options_check
      check (employment_type = 'minijob' or (not minijob_flat_tax_2_percent and not pension_insurance_exemption));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_compensation_check') then
    alter table public.employees add constraint employees_compensation_check check (
      (compensation_type is null and hourly_wage is null and fixed_salary is null)
      or (compensation_type = 'hourly' and hourly_wage is not null and hourly_wage >= 0 and fixed_salary is null)
      or (compensation_type = 'fixed' and fixed_salary is not null and fixed_salary >= 0 and hourly_wage is null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'employees_hours_vacation_check') then
    alter table public.employees add constraint employees_hours_vacation_check
      check ((hours_per_week is null or hours_per_week >= 0) and (annual_vacation_days is null or annual_vacation_days >= 0));
  end if;
end $$;

create index if not exists employees_company_start_date_idx
  on public.employees(company_id, employment_start_date desc nulls last);

-- Existing employees RLS remains enabled and unchanged. Verify before deployment:
-- select relrowsecurity from pg_class where oid = 'public.employees'::regclass;
-- select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'employees';
-- select column_name, data_type from information_schema.columns
-- where table_schema = 'public' and table_name = 'employees' order by ordinal_position;

-- Rollback note: leave the nullable profile columns in place to avoid data loss.
-- Constraints and index may be removed manually only after confirming the app no longer uses them.
