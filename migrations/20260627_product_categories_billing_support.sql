-- Product categories for Leonety products and billing-to-access sync.
-- Run in Supabase SQL editor. Safe to re-run.

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  woo_category_id text,
  shopify_category_id text,
  google_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;

create index if not exists product_categories_company_idx
  on public.product_categories(company_id);

create unique index if not exists product_categories_company_name_unique
  on public.product_categories(company_id, lower(name));

create unique index if not exists app_access_company_unique
  on public.app_access(company_id);

alter table public.product_categories enable row level security;

drop policy if exists product_categories_owner_all on public.product_categories;

create policy product_categories_owner_all
  on public.product_categories
  for all
  using (
    exists (
      select 1
      from public.companies c
      where c.id = product_categories.company_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.companies c
      where c.id = product_categories.company_id
        and c.owner_id = auth.uid()
    )
  );

create or replace function public.apply_billing_subscription_to_app_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('trialing', 'active') then
    insert into public.app_access (
      company_id,
      tier,
      manual_override,
      active,
      expires_at,
      updated_at
    )
    values (
      new.company_id,
      new.plan,
      false,
      true,
      new.current_period_end,
      now()
    )
    on conflict (company_id) do update
    set
      tier = excluded.tier,
      manual_override = false,
      active = true,
      expires_at = excluded.expires_at,
      updated_at = now();
  elsif new.status in ('cancelled', 'expired')
    or (
      new.status = 'past_due'
      and new.current_period_end is not null
      and new.current_period_end < now()
    )
  then
    update public.app_access
    set
      active = false,
      expires_at = coalesce(new.current_period_end, now()),
      updated_at = now()
    where company_id = new.company_id
      and manual_override = false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_billing_subscription_to_app_access on public.billing_subscriptions;

create trigger trg_apply_billing_subscription_to_app_access
after insert or update of status, current_period_end, plan
on public.billing_subscriptions
for each row
execute function public.apply_billing_subscription_to_app_access();
