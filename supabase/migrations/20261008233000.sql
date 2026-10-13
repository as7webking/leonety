-- Employee Personalnummer support, corrected from Edit 4 in
-- leonety_consolidated_schema.sql. This is additive and safe to apply only after
-- read-only production inspection confirms the objects are absent or compatible.
-- Automatic allocation is serialized by locking the workspace settings row.

alter table public.employees
  add column if not exists employee_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employees_employee_number_length_check'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_employee_number_length_check
      check (employee_number is null or char_length(btrim(employee_number)) between 1 and 100);
  end if;
end $$;

create unique index if not exists employees_company_employee_number_unique
  on public.employees(company_id, lower(btrim(employee_number)))
  where employee_number is not null and btrim(employee_number) <> '';

create index if not exists employees_company_employee_number_search_idx
  on public.employees(company_id, lower(employee_number) text_pattern_ops)
  where employee_number is not null and btrim(employee_number) <> '';

create table if not exists public.employee_number_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  require_employee_number boolean not null default false,
  automatic_numbering boolean not null default false,
  number_prefix text not null default '',
  next_number bigint not null default 1,
  minimum_digits smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_number_settings_prefix_check check (char_length(number_prefix) <= 32),
  constraint employee_number_settings_next_number_check check (next_number >= 1),
  constraint employee_number_settings_minimum_digits_check check (minimum_digits between 1 and 12)
);

insert into public.employee_number_settings (company_id)
select company.id from public.companies company
on conflict (company_id) do nothing;

create or replace function public.initialize_employee_number_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.employee_number_settings (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_initialize_employee_number_settings on public.companies;
create trigger trg_initialize_employee_number_settings
after insert on public.companies
for each row execute function public.initialize_employee_number_settings();

alter table public.employee_number_settings enable row level security;

drop policy if exists "Owners view employee number settings" on public.employee_number_settings;
create policy "Owners view employee number settings"
  on public.employee_number_settings for select to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = employee_number_settings.company_id and c.owner_id = auth.uid()
  ));

drop policy if exists "Owners create employee number settings" on public.employee_number_settings;
create policy "Owners create employee number settings"
  on public.employee_number_settings for insert to authenticated
  with check (exists (
    select 1 from public.companies c
    where c.id = employee_number_settings.company_id and c.owner_id = auth.uid()
  ));

drop policy if exists "Owners update employee number settings" on public.employee_number_settings;
create policy "Owners update employee number settings"
  on public.employee_number_settings for update to authenticated
  using (exists (
    select 1 from public.companies c
    where c.id = employee_number_settings.company_id and c.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = employee_number_settings.company_id and c.owner_id = auth.uid()
  ));

grant select, insert, update on public.employee_number_settings to authenticated;

create or replace function public.guard_employee_number_settings_counter()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.number_prefix := btrim(new.number_prefix);
  if tg_op = 'UPDATE' and new.next_number < old.next_number then
    raise exception 'Employee number counter cannot be decreased' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_guard_employee_number_settings_counter on public.employee_number_settings;
create trigger trg_guard_employee_number_settings_counter
before insert or update on public.employee_number_settings
for each row execute function public.guard_employee_number_settings_counter();

create or replace function public.prepare_employee_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  settings_row public.employee_number_settings%rowtype;
  candidate text;
  candidate_number bigint;
begin
  new.employee_number := nullif(btrim(new.employee_number), '');

  select * into settings_row
  from public.employee_number_settings settings
  where settings.company_id = new.company_id
  for update;

  if not found then
    return new;
  end if;

  if settings_row.automatic_numbering then
    if tg_op = 'INSERT' and new.employee_number is not null then
      raise exception 'Manual employee numbers are disabled for this workspace' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE'
      and old.employee_number is not null
      and new.employee_number is distinct from old.employee_number then
      raise exception 'Employee numbers cannot be changed while automatic numbering is enabled' using errcode = '23514';
    end if;

    if new.employee_number is null then
      candidate_number := settings_row.next_number;
      loop
        -- Avoid lpad truncation once the counter grows beyond minimum_digits.
        candidate := settings_row.number_prefix || case
          when char_length(candidate_number::text) < settings_row.minimum_digits
            then lpad(candidate_number::text, settings_row.minimum_digits, '0')
          else candidate_number::text
        end;

        exit when not exists (
          select 1 from public.employees employee
          where employee.company_id = new.company_id
            and lower(btrim(employee.employee_number)) = lower(candidate)
            and (tg_op = 'INSERT' or employee.id <> new.id)
        );
        candidate_number := candidate_number + 1;
      end loop;

      update public.employee_number_settings
      set next_number = candidate_number + 1, updated_at = now()
      where company_id = new.company_id;
      new.employee_number := candidate;
    end if;
  end if;

  if settings_row.require_employee_number and new.employee_number is null then
    raise exception 'Employee number is required for this workspace' using errcode = '23502';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_employee_number on public.employees;
create trigger trg_prepare_employee_number
before insert or update on public.employees
for each row execute function public.prepare_employee_number();

comment on column public.employees.employee_number is
  'Optional workspace-scoped employee number; uniqueness is case-insensitive.';
comment on table public.employee_number_settings is
  'Workspace employee-number policy and monotonic atomic allocation counter.';
