-- Protect issued invoice content and line items while retaining draft workflows,
-- status transitions, payment records, and workspace authorization.
-- Additive: creates trigger functions and triggers only; no backfill or data rewrite.
begin;

create or replace function public.prevent_finalized_invoice_content_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft'
    and old.document_snapshot is null
    and old.issued_at is null then
    return new;
  end if;

  if new.status = 'draft' then
    raise exception 'An issued invoice cannot return to draft'
      using errcode = '55000';
  end if;

  -- Status and updated_at are the only mutable invoice columns after issuance.
  -- Comparing row JSON also protects future content columns without a backfill.
  if (to_jsonb(new) - array['status', 'updated_at'])
    is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Issued invoice content is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_finalized_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft'
    or old.document_snapshot is not null
    or old.issued_at is not null then
    raise exception 'An issued invoice cannot be deleted'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function public.prevent_finalized_invoice_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_invoice_id uuid;
  parent_status text;
  parent_snapshot jsonb;
  parent_issued_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'An invoice line cannot be moved to another invoice'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    parent_invoice_id := old.invoice_id;
  else
    parent_invoice_id := new.invoice_id;
  end if;

  select i.status, i.document_snapshot, i.issued_at
    into parent_status, parent_snapshot, parent_issued_at
  from public.invoices i
  where i.id = parent_invoice_id
  for update;

  -- A missing parent is only expected for a cascading delete of a draft invoice.
  if not found then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Invoice for line item was not found'
      using errcode = '23503';
  end if;

  if parent_status <> 'draft'
    or parent_snapshot is not null
    or parent_issued_at is not null then
    raise exception 'Issued invoice line items are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_finalized_invoice_content_change on public.invoices;
create trigger trg_prevent_finalized_invoice_content_change
before update on public.invoices
for each row execute function public.prevent_finalized_invoice_content_change();

drop trigger if exists trg_prevent_finalized_invoice_delete on public.invoices;
create trigger trg_prevent_finalized_invoice_delete
before delete on public.invoices
for each row execute function public.prevent_finalized_invoice_delete();

drop trigger if exists trg_prevent_finalized_invoice_item_change on public.invoice_items;
create trigger trg_prevent_finalized_invoice_item_change
before insert or update or delete on public.invoice_items
for each row execute function public.prevent_finalized_invoice_item_change();

commit;
