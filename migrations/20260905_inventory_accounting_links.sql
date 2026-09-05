-- Leonety inventory accounting links.
-- Additive and safe to re-run. Does not delete or rewrite existing movements.

alter table public.stock_movements
  add column if not exists unit_purchase_cost numeric(12,2) check (unit_purchase_cost is null or unit_purchase_cost >= 0),
  add column if not exists selling_price numeric(12,2) check (selling_price is null or selling_price >= 0),
  add column if not exists previous_quantity numeric(14,3),
  add column if not exists resulting_quantity numeric(14,3),
  add column if not exists linked_expense_id bigint references public.expenses(id) on delete set null,
  add column if not exists source text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists stock_movements_company_product_created_idx
  on public.stock_movements(company_id, product_id, created_at desc);

create index if not exists stock_movements_linked_expense_idx
  on public.stock_movements(company_id, linked_expense_id)
  where linked_expense_id is not null;

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
    notes,
    previous_quantity,
    resulting_quantity,
    created_by
  )
  values (
    p_company_id,
    p_product_id,
    p_type,
    p_quantity,
    btrim(p_reason),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''),
    current_quantity,
    current_quantity + quantity_change,
    auth.uid()
  )
  returning * into movement_row;

  return movement_row;
end;
$$;

-- Verification:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'stock_movements'
--   and column_name in ('unit_purchase_cost', 'selling_price', 'previous_quantity', 'resulting_quantity', 'linked_expense_id', 'source', 'created_by');
--
-- Rollback note:
-- Leave columns in place to preserve audit history. Removing them would discard linkage metadata.
