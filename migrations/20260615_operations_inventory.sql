begin;

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  job_title text not null,
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'minijob', 'freelance', 'contractor', 'other')),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'on_leave')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_company_id_id_unique unique (company_id, id)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  city text not null,
  country text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_company_id_id_unique unique (company_id, id)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null,
  location_id uuid,
  date date not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 1440),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'missed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_valid_time check (end_time > start_time),
  constraint shifts_employee_company_fkey
    foreign key (company_id, employee_id)
    references public.employees(company_id, id)
    on delete restrict,
  constraint shifts_location_company_fkey
    foreign key (company_id, location_id)
    references public.locations(company_id, id)
    on delete restrict
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sku text,
  barcode text,
  category text,
  description text,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  selling_price numeric(12,2) check (selling_price is null or selling_price >= 0),
  currency text not null default 'EUR',
  current_stock numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0 check (low_stock_threshold >= 0),
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_company_id_id_unique unique (company_id, id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  type text not null check (type in ('stock_in', 'stock_out', 'adjustment', 'return')),
  quantity numeric(14,3) not null check (quantity >= 0),
  reason text not null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  constraint stock_movements_product_company_fkey
    foreign key (company_id, product_id)
    references public.products(company_id, id)
    on delete restrict
);

create index if not exists employees_company_id_idx on public.employees(company_id);
create index if not exists employees_company_status_idx on public.employees(company_id, status);
create index if not exists locations_company_id_idx on public.locations(company_id);
create index if not exists shifts_company_date_idx on public.shifts(company_id, date);
create index if not exists shifts_employee_date_idx on public.shifts(employee_id, date);
create index if not exists shifts_location_date_idx on public.shifts(location_id, date);
create unique index if not exists shifts_no_exact_duplicate_idx
  on public.shifts(company_id, employee_id, date, start_time, end_time)
  where status <> 'cancelled';
create index if not exists products_company_id_idx on public.products(company_id);
create index if not exists products_company_status_idx on public.products(company_id, status);
create unique index if not exists products_company_sku_unique
  on public.products(company_id, lower(sku))
  where sku is not null and btrim(sku) <> '';
create unique index if not exists products_company_barcode_unique
  on public.products(company_id, barcode)
  where barcode is not null and btrim(barcode) <> '';
create index if not exists stock_movements_company_created_idx
  on public.stock_movements(company_id, created_at desc);
create index if not exists stock_movements_product_created_idx
  on public.stock_movements(product_id, created_at desc);

alter table public.employees enable row level security;
alter table public.locations enable row level security;
alter table public.shifts enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Owners manage employees" on public.employees;
create policy "Owners manage employees" on public.employees
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = employees.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = employees.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage locations" on public.locations;
create policy "Owners manage locations" on public.locations
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = locations.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = locations.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage shifts" on public.shifts;
create policy "Owners manage shifts" on public.shifts
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = shifts.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = shifts.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage products" on public.products;
create policy "Owners manage products" on public.products
for all
using (
  exists (
    select 1 from public.companies c
    where c.id = products.company_id and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = products.company_id and c.owner_id = auth.uid()
  )
);

drop policy if exists "Owners view stock movements" on public.stock_movements;
create policy "Owners view stock movements" on public.stock_movements
for select
using (
  exists (
    select 1 from public.companies c
    where c.id = stock_movements.company_id and c.owner_id = auth.uid()
  )
);

create or replace function public.record_stock_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text,
  p_reference text default null,
  p_notes text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  current_quantity numeric;
  quantity_change numeric;
  movement_row public.stock_movements%rowtype;
begin
  if p_type not in ('stock_in', 'stock_out', 'adjustment', 'return') then
    raise exception 'Invalid stock movement type' using errcode = 'P0001';
  end if;

  if p_quantity is null or (p_type <> 'adjustment' and p_quantity <= 0) or (p_type = 'adjustment' and p_quantity < 0) then
    raise exception 'Quantity must be valid for the movement type' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reason is required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.companies c
    where c.id = p_company_id and c.owner_id = auth.uid()
  ) then
    raise exception 'Workspace access denied' using errcode = 'P0001';
  end if;

  select current_stock
  into current_quantity
  from public.products
  where id = p_product_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = 'P0001';
  end if;

  quantity_change := case
    when p_type in ('stock_in', 'return') then p_quantity
    when p_type = 'stock_out' then -p_quantity
    when p_type = 'adjustment' then p_quantity - current_quantity
  end;

  if current_quantity + quantity_change < 0 then
    raise exception 'Insufficient stock' using errcode = 'P0001';
  end if;

  update public.products
  set
    current_stock = current_quantity + quantity_change,
    updated_at = now()
  where id = p_product_id and company_id = p_company_id;

  insert into public.stock_movements (
    company_id,
    product_id,
    type,
    quantity,
    reason,
    reference,
    notes
  )
  values (
    p_company_id,
    p_product_id,
    p_type,
    p_quantity,
    btrim(p_reason),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), '')
  )
  returning * into movement_row;

  return movement_row;
end;
$$;

revoke all on function public.record_stock_movement(uuid, uuid, text, numeric, text, text, text) from public;
grant execute on function public.record_stock_movement(uuid, uuid, text, numeric, text, text, text) to authenticated;

commit;
