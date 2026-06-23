alter table public.products
  add column if not exists image_url text,
  add column if not exists woo_product_type text not null default 'simple'
    check (woo_product_type in ('simple', 'variable')),
  add column if not exists woo_attributes jsonb not null default '[]'::jsonb,
  add column if not exists woo_variants jsonb not null default '[]'::jsonb;

create table if not exists public.woocommerce_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  store_url text not null,
  consumer_key text not null,
  consumer_secret text not null,
  inventory_sync_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_syncs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  channel text not null default 'woocommerce'
    check (channel in ('woocommerce', 'shopify')),
  external_product_id text,
  external_variant_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_id, channel)
);

create index if not exists product_syncs_company_idx
  on public.product_syncs(company_id);

create index if not exists product_syncs_product_idx
  on public.product_syncs(product_id);

create index if not exists product_syncs_channel_idx
  on public.product_syncs(company_id, channel);

alter table public.product_syncs
  add column if not exists channel text not null default 'woocommerce',
  add column if not exists external_product_id text,
  add column if not exists external_variant_id text,
  add column if not exists last_synced_at timestamptz;

alter table public.product_syncs
  drop constraint if exists product_syncs_sync_status_check;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_syncs'
      and column_name = 'woo_product_id'
  ) then
    update public.product_syncs
    set external_product_id = coalesce(external_product_id, woo_product_id::text);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_syncs'
      and column_name = 'last_sync_at'
  ) then
    update public.product_syncs
    set last_synced_at = coalesce(last_synced_at, last_sync_at);
  end if;
end $$;

update public.product_syncs
set sync_status = case
  when sync_status = 'error' then 'failed'
  when sync_status in ('not_synced', 'pending', 'synced', 'failed') then sync_status
  else 'not_synced'
end;

alter table public.product_syncs
  add constraint product_syncs_sync_status_check
  check (sync_status in ('not_synced', 'pending', 'synced', 'failed'));

alter table public.product_syncs
  drop constraint if exists product_syncs_company_id_product_id_key;

create unique index if not exists product_syncs_company_product_channel_unique
  on public.product_syncs(company_id, product_id, channel);

alter table public.woocommerce_connections enable row level security;
alter table public.product_syncs enable row level security;

drop policy if exists product_syncs_owner_select on public.product_syncs;
create policy product_syncs_owner_select
  on public.product_syncs
  for select
  using (exists (
    select 1 from public.companies c
    where c.id = product_syncs.company_id
      and c.owner_id = auth.uid()
  ));

-- Credentials in woocommerce_connections are intentionally not exposed through RLS.
-- Leonety reads/writes them only from server-side API routes after verifying workspace ownership.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_owner_select on storage.objects;
create policy product_images_owner_select
  on storage.objects
  for select
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_images_owner_insert on storage.objects;
create policy product_images_owner_insert
  on storage.objects
  for insert
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
  on storage.objects
  for update
  using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.companies c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.owner_id = auth.uid()
    )
  );
