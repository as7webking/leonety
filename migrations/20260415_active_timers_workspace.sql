-- Workspace-based active timers for the authenticated app.
-- This migration aligns the database with the current client flow:
-- - active_timers are owned through companies.owner_id
-- - starting a timer inserts company_id + description + started_at
-- - stopping a timer persists a time_entries row and removes the active timer

begin;

create extension if not exists pgcrypto;

create table if not exists public.active_timers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null default 'Timed session',
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists active_timers_company_id_idx
  on public.active_timers(company_id);

create index if not exists active_timers_started_at_idx
  on public.active_timers(started_at);

alter table public.active_timers enable row level security;

drop policy if exists "Users can view own active timers" on public.active_timers;
drop policy if exists "Users can insert own active timers" on public.active_timers;
drop policy if exists "Users can update own active timers" on public.active_timers;
drop policy if exists "Users can delete own active timers" on public.active_timers;

create policy "Users can view own active timers"
on public.active_timers
for select
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can insert own active timers"
on public.active_timers
for insert
with check (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can update own active timers"
on public.active_timers
for update
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create policy "Users can delete own active timers"
on public.active_timers
for delete
using (
  exists (
    select 1
    from public.companies c
    where c.id = active_timers.company_id
      and c.owner_id = auth.uid()
  )
);

create or replace function public.stop_active_timer(p_user_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  active_timer_row public.active_timers%rowtype;
  inserted_entry public.time_entries%rowtype;
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

  insert into public.time_entries (
    company_id,
    description,
    hours,
    date
  )
  values (
    active_timer_row.company_id,
    active_timer_row.description,
    round((extract(epoch from (now() - active_timer_row.started_at)) / 3600.0)::numeric, 2),
    (active_timer_row.started_at at time zone 'utc')::date
  )
  returning *
  into inserted_entry;

  delete from public.active_timers
  where id = active_timer_row.id;

  return inserted_entry;
end;
$$;

grant execute on function public.stop_active_timer(uuid) to authenticated;

commit;
