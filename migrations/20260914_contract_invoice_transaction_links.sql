-- Additive Contract -> Invoice -> Income linkage and idempotent paid-invoice accounting.
-- Review and run manually in Supabase. No existing rows are deleted or rewritten.

begin;

do $$
declare
  relation_name text;
  id_type text;
begin
  foreach relation_name in array array['clients', 'contracts', 'invoices', 'incomes'] loop
    select c.data_type into id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = relation_name
      and c.column_name = 'id';

    if id_type is distinct from 'uuid' then
      raise exception 'Expected public.%.id to be uuid, found %', relation_name, coalesce(id_type, 'missing');
    end if;
  end loop;
end
$$;

alter table public.invoices
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

alter table public.incomes
  add column if not exists title text,
  add column if not exists reference text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

create index if not exists invoices_company_contract_idx
  on public.invoices(company_id, contract_id)
  where contract_id is not null;

create index if not exists incomes_company_client_idx
  on public.incomes(company_id, client_id)
  where client_id is not null;

create unique index if not exists contracts_company_id_id_unique
  on public.contracts(company_id, id);

create unique index if not exists invoices_company_id_id_unique
  on public.invoices(company_id, id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_contract_id_fkey') then
    alter table public.invoices
      add constraint invoices_contract_id_fkey
      foreign key (contract_id)
      references public.contracts(id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'incomes_invoice_id_fkey') then
    alter table public.incomes
      add constraint incomes_invoice_id_fkey
      foreign key (invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_company_contract_fkey') then
    alter table public.invoices
      add constraint invoices_company_contract_fkey
      foreign key (company_id, contract_id)
      references public.contracts(company_id, id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'incomes_company_invoice_fkey') then
    alter table public.incomes
      add constraint incomes_company_invoice_fkey
      foreign key (company_id, invoice_id)
      references public.invoices(company_id, id)
      not valid;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.incomes
    where invoice_id is not null
    group by company_id, invoice_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate invoice-linked incomes exist; review them before creating the uniqueness index.';
  end if;
end
$$;

create unique index if not exists incomes_one_per_invoice_idx
  on public.incomes(company_id, invoice_id)
  where invoice_id is not null;

create or replace function public.enforce_invoice_contract_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  contract_client_id uuid;
begin
  if new.contract_id is null then
    return new;
  end if;

  select client_id
  into contract_client_id
  from public.contracts
  where id = new.contract_id
    and company_id = new.company_id;

  if not found then
    raise exception 'Contract not found in invoice workspace' using errcode = '23503';
  end if;

  if contract_client_id is not null and new.client_id is distinct from contract_client_id then
    raise exception 'Invoice client must match contract client' using errcode = '23514';
  end if;

  return new;
end
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_invoice_contract_scope_trigger') then
    create trigger enforce_invoice_contract_scope_trigger
      before insert or update of company_id, contract_id, client_id
      on public.invoices
      for each row
      execute function public.enforce_invoice_contract_scope();
  end if;
end
$$;

create or replace function public.record_paid_invoice_income(
  p_invoice_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
  paid_total numeric;
  payment_method_value text;
  income_id uuid;
  legacy_income_count integer;
begin
  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found or access denied' using errcode = '42501';
  end if;

  if invoice_row.status <> 'paid' then
    raise exception 'Invoice is not marked paid' using errcode = '23514';
  end if;

  select
    coalesce(sum(amount), 0),
    case when count(distinct method) = 1 then min(method) else null end
  into paid_total, payment_method_value
  from public.invoice_payments
  where invoice_id = invoice_row.id
    and company_id = invoice_row.company_id;

  if round(paid_total, 2) <> round(invoice_row.total, 2) then
    raise exception 'Payment allocations do not equal the invoice total' using errcode = '23514';
  end if;

  select count(*), (array_agg(id order by id))[1]
  into legacy_income_count, income_id
  from public.incomes
  where company_id = invoice_row.company_id
    and invoice_id is null
    and category = 'Invoice Payment'
    and description = 'Invoice ' || invoice_row.invoice_number || ' paid'
    and round(amount, 2) = round(invoice_row.total, 2)
    and currency = invoice_row.currency;

  if legacy_income_count = 1 then
    update public.incomes
    set
      invoice_id = invoice_row.id,
      client_id = invoice_row.client_id,
      reference = invoice_row.invoice_number,
      payment_method = payment_method_value
    where id = income_id;
  end if;

  insert into public.incomes (
    company_id,
    user_id,
    title,
    description,
    category,
    amount,
    currency,
    date,
    client_id,
    invoice_id,
    reference,
    payment_method
  ) values (
    invoice_row.company_id,
    auth.uid(),
    coalesce(nullif(btrim(p_title), ''), invoice_row.invoice_number),
    'Invoice ' || invoice_row.invoice_number || ' paid',
    'Invoice Payment',
    invoice_row.total,
    invoice_row.currency,
    invoice_row.issue_date,
    invoice_row.client_id,
    invoice_row.id,
    invoice_row.invoice_number,
    payment_method_value
  )
  on conflict (company_id, invoice_id) where invoice_id is not null
  do update set
    amount = excluded.amount,
    currency = excluded.currency,
    date = excluded.date,
    client_id = excluded.client_id,
    reference = excluded.reference,
    payment_method = excluded.payment_method,
    description = excluded.description
  returning id into income_id;

  return income_id;
end
$$;

revoke all on function public.record_paid_invoice_income(uuid, text) from public;
grant execute on function public.record_paid_invoice_income(uuid, text) to authenticated;

commit;

-- Verification (read-only):
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('contracts', 'invoices', 'incomes', 'invoice_payments')
--   and column_name in ('id', 'company_id', 'client_id', 'contract_id', 'invoice_id');
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in ('invoices_company_contract_idx', 'incomes_one_per_invoice_idx');
--
-- Before validating the NOT VALID workspace constraints, both checks must return 0:
-- select count(*)
-- from public.invoices i
-- join public.contracts c on c.id = i.contract_id
-- where i.contract_id is not null and i.company_id <> c.company_id;
--
-- select count(*)
-- from public.incomes x
-- join public.invoices i on i.id = x.invoice_id
-- where x.invoice_id is not null and x.company_id <> i.company_id;
--
-- After both checks return 0, validate manually:
-- alter table public.invoices validate constraint invoices_company_contract_fkey;
-- alter table public.incomes validate constraint incomes_company_invoice_fkey;
--
-- select company_id, invoice_id, count(*)
-- from public.incomes
-- where invoice_id is not null
-- group by company_id, invoice_id
-- having count(*) > 1;

-- Rollback note: remove execute permission/function and indexes only after the app no
-- longer calls the RPC. New columns and relationship data should be retained.
