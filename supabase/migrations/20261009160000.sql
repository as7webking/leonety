-- Pending proposal. Verify public.invoices and its production permissions first.
-- No historical backfill is performed because original party data is unknown.

alter table public.invoices
  add column if not exists document_snapshot jsonb;

comment on column public.invoices.document_snapshot is
  'Immutable seller, buyer and invoice template presentation captured when an invoice first leaves draft; historical rows are intentionally not backfilled.';

create or replace function public.prevent_invoice_document_snapshot_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and new.document_snapshot is null then
      raise exception 'A non-draft invoice requires a document snapshot'
        using errcode = '23514';
    end if;
    if new.status = 'draft' and new.document_snapshot is not null then
      raise exception 'Draft invoices must not have a finalized document snapshot'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.document_snapshot is null
    and new.document_snapshot is not null
    and (old.status <> 'draft' or new.status = 'draft') then
    raise exception 'A historical invoice snapshot can only be captured when leaving draft'
      using errcode = '55000';
  end if;

  if old.status = 'draft'
    and new.status <> 'draft'
    and new.document_snapshot is null then
    raise exception 'A non-draft invoice requires a document snapshot'
      using errcode = '23514';
  end if;

  if old.document_snapshot is not null
    and new.document_snapshot is distinct from old.document_snapshot then
    raise exception 'Finalized invoice document snapshot is immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.invoices'::regclass
      and tgname = 'trg_prevent_invoice_document_snapshot_change'
      and not tgisinternal
  ) then
    create trigger trg_prevent_invoice_document_snapshot_change
    before update of document_snapshot, status on public.invoices
    for each row
    execute function public.prevent_invoice_document_snapshot_change();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.invoices'::regclass
      and tgname = 'trg_require_invoice_document_snapshot_on_insert'
      and not tgisinternal
  ) then
    create trigger trg_require_invoice_document_snapshot_on_insert
    before insert on public.invoices
    for each row
    execute function public.prevent_invoice_document_snapshot_change();
  end if;
end;
$$;
