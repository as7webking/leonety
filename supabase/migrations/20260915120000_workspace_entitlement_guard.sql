-- Server-side workspace limit enforcement and admin audit metadata.
-- Apply once after reviewing the current production schema. No data is deleted.

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists admin_audit_events_target_created_idx
  on public.admin_audit_events(target_user_id, created_at desc);

alter table public.admin_audit_events enable row level security;

-- No authenticated policy is intentional. Admin audit writes use the server-only
-- service role after the request has passed the existing admin_accounts check.
revoke all on public.admin_audit_events from anon, authenticated;

create or replace function public.enforce_workspace_entitlement_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace_count integer;
  highest_plan_rank integer := 0;
  workspace_limit integer;
begin
  -- Serialize workspace creation per owner so parallel requests cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  if exists (
    select 1
    from public.admin_accounts admin_account
    where admin_account.user_id = new.owner_id
  ) then
    return new;
  end if;

  select coalesce(max(entitlement.plan_rank), 0)
  into highest_plan_rank
  from (
    select case access.tier
      when 'business' then 3
      when 'pro' then 2
      when 'starter' then 1
      else 0
    end as plan_rank
    from public.app_access access
    join public.companies company on company.id = access.company_id
    where company.owner_id = new.owner_id
      and access.active = true
      and (access.expires_at is null or access.expires_at > now())

    union all

    select case subscription.plan
      when 'business' then 3
      when 'pro' then 2
      when 'starter' then 1
      else 0
    end as plan_rank
    from public.billing_subscriptions subscription
    join public.companies company on company.id = subscription.company_id
    where company.owner_id = new.owner_id
      and subscription.status in ('trialing', 'active')
      and (subscription.current_period_end is null or subscription.current_period_end > now())
  ) entitlement;

  -- Mirrors the audited application definitions: Free 1, Starter 2,
  -- Pro/Business unlimited. Update both this guard and src/lib/billing/plans.ts
  -- together if product limits intentionally change later.
  workspace_limit := case highest_plan_rank
    when 0 then 1
    when 1 then 2
    else null
  end;

  if workspace_limit is null then
    return new;
  end if;

  select count(*)::integer
  into workspace_count
  from public.companies company
  where company.owner_id = new.owner_id;

  if workspace_count >= workspace_limit then
    raise exception using
      errcode = 'P0001',
      message = 'workspace_limit_reached';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_workspace_entitlement_limit() from public;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_enforce_workspace_entitlement_limit'
      and tgrelid = 'public.companies'::regclass
      and not tgisinternal
  ) then
    create trigger trg_enforce_workspace_entitlement_limit
      before insert on public.companies
      for each row
      execute function public.enforce_workspace_entitlement_limit();
  end if;
end;
$$;

-- Verification (read-only):
-- select tgname from pg_trigger
-- where tgrelid = 'public.companies'::regclass and not tgisinternal;
-- select action, metadata, created_at
-- from public.admin_audit_events
-- order by created_at desc
-- limit 20;

-- Rollback notes (manual, only if this feature must be reverted):
-- Removing the trigger/function restores the previous insert behavior. Keep
-- admin_audit_events to preserve audit history; do not delete its rows.
