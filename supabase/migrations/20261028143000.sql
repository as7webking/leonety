create table if not exists public.notification_read_states (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null check (char_length(notification_key) between 1 and 512),
  is_read boolean not null default true,
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id, notification_key),
  constraint notification_read_states_read_at_check
    check ((is_read and read_at is not null) or (not is_read and read_at is null))
);

create index if not exists notification_read_states_user_workspace_idx
  on public.notification_read_states (company_id, user_id, is_read);

alter table public.notification_read_states enable row level security;

drop policy if exists notification_read_states_owner_access on public.notification_read_states;
create policy notification_read_states_owner_access
  on public.notification_read_states
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = notification_read_states.company_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = notification_read_states.company_id
        and c.owner_id = auth.uid()
    )
  );

revoke all on public.notification_read_states from anon, authenticated;
grant all on public.notification_read_states to service_role;
