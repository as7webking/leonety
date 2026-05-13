-- Align timer start with a server-checked RPC and persist exchange-rate snapshots.

begin;

alter table public.incomes
  add column if not exists exchange_rate numeric(18,8) not null default 1,
  add column if not exists workspace_currency text not null default 'USD';

alter table public.expenses
  add column if not exists exchange_rate numeric(18,8) not null default 1,
  add column if not exists workspace_currency text not null default 'USD';

update public.incomes
set workspace_currency = coalesce(nullif(workspace_currency, ''), currency),
    exchange_rate = coalesce(exchange_rate, 1)
where workspace_currency is null
   or workspace_currency = ''
   or exchange_rate is null;

update public.expenses
set workspace_currency = coalesce(nullif(workspace_currency, ''), currency),
    exchange_rate = coalesce(exchange_rate, 1)
where workspace_currency is null
   or workspace_currency = ''
   or exchange_rate is null;

create or replace function public.start_active_timer(
  company_uuid uuid,
  timer_description text default 'Timed session',
  timer_started_at timestamptz default now()
)
returns public.active_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  created_timer public.active_timers%rowtype;
begin
  if not exists (
    select 1
    from public.companies c
    where c.id = company_uuid
      and c.owner_id = auth.uid()
  ) then
    raise exception 'Company not found or access denied'
      using errcode = '42501';
  end if;

  insert into public.active_timers (
    company_id,
    description,
    started_at
  )
  values (
    company_uuid,
    coalesce(nullif(trim(timer_description), ''), 'Timed session'),
    coalesce(timer_started_at, now())
  )
  returning *
  into created_timer;

  return created_timer;
end;
$$;

grant execute on function public.start_active_timer(uuid, text, timestamptz) to authenticated;

commit;
