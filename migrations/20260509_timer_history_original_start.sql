-- Preserve original timer starts and complete timers server-side.

begin;

alter table public.active_timers
  add column if not exists original_started_at timestamptz;

update public.active_timers
set original_started_at = started_at
where original_started_at is null;

alter table public.active_timers
  alter column original_started_at set default now();

alter table public.time_entries
  add column if not exists timer_started_at timestamptz,
  add column if not exists timer_completed_at timestamptz;

create or replace function public.resume_active_timer(p_timer_id uuid)
returns public.active_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  timer_row public.active_timers%rowtype;
begin
  update public.active_timers
  set
    started_at = now(),
    original_started_at = coalesce(original_started_at, started_at),
    paused_at = null
  where id = p_timer_id
    and paused_at is not null
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    )
  returning *
  into timer_row;

  if not found then
    raise exception 'Paused timer not found or access denied'
      using errcode = 'P0001';
  end if;

  return timer_row;
end;
$$;

create or replace function public.stop_active_timer(p_timer_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  active_timer_row public.active_timers%rowtype;
  inserted_entry public.time_entries%rowtype;
  total_seconds integer;
  started_at_for_history timestamptz;
begin
  select *
  into active_timer_row
  from public.active_timers
  where id = p_timer_id
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    );

  if not found then
    raise exception 'Active timer not found or access denied'
      using errcode = 'P0001';
  end if;

  started_at_for_history := coalesce(active_timer_row.original_started_at, active_timer_row.started_at);

  total_seconds := active_timer_row.accumulated_seconds +
    case
      when active_timer_row.paused_at is null
        then greatest(0, floor(extract(epoch from (now() - active_timer_row.started_at)))::integer)
      else 0
    end;

  insert into public.time_entries (
    user_id,
    company_id,
    description,
    hours,
    date,
    timer_started_at,
    timer_completed_at
  )
  values (
    auth.uid(),
    active_timer_row.company_id,
    active_timer_row.description,
    round((total_seconds / 3600.0)::numeric, 2),
    (started_at_for_history at time zone 'utc')::date,
    started_at_for_history,
    now()
  )
  returning *
  into inserted_entry;

  delete from public.active_timers
  where id = active_timer_row.id;

  return inserted_entry;
end;
$$;

grant execute on function public.resume_active_timer(uuid) to authenticated;
grant execute on function public.stop_active_timer(uuid) to authenticated;

commit;
