begin;

alter table public.active_timers
  drop constraint if exists uq_active_timers_user_id;

alter table public.active_timers
  add column if not exists paused_at timestamptz,
  add column if not exists accumulated_seconds integer not null default 0;

create or replace function public.enforce_active_timer_limit()
returns trigger
language plpgsql
as $$
declare
  active_timer_count integer;
begin
  select count(*)
  into active_timer_count
  from public.active_timers
  where user_id = new.user_id;

  if active_timer_count >= 7 then
    raise exception 'Maximum of 7 active timers allowed per user'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_active_timer_limit on public.active_timers;

create trigger trg_enforce_active_timer_limit
before insert on public.active_timers
for each row
execute function public.enforce_active_timer_limit();

create or replace function public.pause_active_timer(p_timer_id uuid)
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
    accumulated_seconds = accumulated_seconds + greatest(0, floor(extract(epoch from (now() - started_at)))::integer),
    paused_at = now()
  where id = p_timer_id
    and paused_at is null
    and exists (
      select 1
      from public.companies c
      where c.id = active_timers.company_id
        and c.owner_id = auth.uid()
    )
  returning *
  into timer_row;

  if not found then
    raise exception 'Active timer not found or access denied'
      using errcode = 'P0001';
  end if;

  return timer_row;
end;
$$;

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

create or replace function public.stop_active_timer(p_user_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  active_timer_row public.active_timers%rowtype;
  inserted_entry public.time_entries%rowtype;
  total_seconds integer;
begin
  select *
  into active_timer_row
  from public.active_timers
  where id = p_user_id
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

  total_seconds := active_timer_row.accumulated_seconds +
    case
      when active_timer_row.paused_at is null
        then greatest(0, floor(extract(epoch from (now() - active_timer_row.started_at)))::integer)
      else 0
    end;

  insert into public.time_entries (
    company_id,
    description,
    hours,
    date
  )
  values (
    active_timer_row.company_id,
    active_timer_row.description,
    round((total_seconds / 3600.0)::numeric, 2),
    now()::date
  )
  returning *
  into inserted_entry;

  delete from public.active_timers
  where id = active_timer_row.id;

  return inserted_entry;
end;
$$;

grant execute on function public.pause_active_timer(uuid) to authenticated;
grant execute on function public.resume_active_timer(uuid) to authenticated;
grant execute on function public.stop_active_timer(uuid) to authenticated;

commit;
