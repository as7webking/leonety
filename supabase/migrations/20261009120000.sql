-- Pending proposal: prevent concurrent overlapping shifts for one employee/day.
-- Do not apply until production schema and existing overlaps are reviewed.

create or replace function public.prevent_employee_shift_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Serialize writes that could conflict; separate employees/dates remain concurrent.
  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text || ':' || new.employee_id::text || ':' || new.date::text, 0)
  );

  if exists (
    select 1
    from public.shifts existing
    where existing.company_id = new.company_id
      and existing.employee_id = new.employee_id
      and existing.date = new.date
      and existing.status <> 'cancelled'
      and existing.id is distinct from new.id
      and new.start_time < existing.end_time
      and new.end_time > existing.start_time
      and (new.start_time <> existing.start_time or new.end_time <> existing.end_time)
  ) then
    raise exception 'Employee shift overlaps an existing shift'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_employee_shift_overlap on public.shifts;
create trigger trg_prevent_employee_shift_overlap
before insert or update of company_id, employee_id, date, start_time, end_time, status
on public.shifts
for each row
execute function public.prevent_employee_shift_overlap();
