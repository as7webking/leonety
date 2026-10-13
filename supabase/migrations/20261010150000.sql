-- Store one coarse-grained Leonety usage timestamp per authenticated account.
-- No auth.users changes and no event log. The RPC enforces a global 5-minute
-- write interval, including concurrent requests from multiple browser tabs.

begin;

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null
);

alter table public.user_activity enable row level security;
revoke all on table public.user_activity from public, anon, authenticated;
grant select, insert, update, delete on table public.user_activity to service_role;

create or replace function public.record_leonety_user_activity(p_user_id uuid)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  recorded_at timestamptz := clock_timestamp();
  result_at timestamptz;
begin
  insert into public.user_activity (user_id, last_activity_at)
  values (p_user_id, recorded_at)
  on conflict (user_id) do update
    set last_activity_at = excluded.last_activity_at
    where public.user_activity.last_activity_at <= recorded_at - interval '5 minutes'
  returning last_activity_at into result_at;

  return result_at;
end;
$$;

revoke all on function public.record_leonety_user_activity(uuid) from public, anon, authenticated;
grant execute on function public.record_leonety_user_activity(uuid) to service_role;

comment on table public.user_activity is
  'Server-only coarse Leonety activity summary; one row per auth user, not an event log.';
comment on column public.user_activity.last_activity_at is
  'Last qualifying authenticated foreground app use; writes are rate-limited to once per five minutes per user.';

commit;

-- Read-only verification after manual application:
-- select c.relname, c.relrowsecurity
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relname = 'user_activity';
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'user_activity'
-- order by grantee, privilege_type;
-- select routine_name, grantee, privilege_type
-- from information_schema.routine_privileges
-- where specific_schema = 'public' and routine_name = 'record_leonety_user_activity';
