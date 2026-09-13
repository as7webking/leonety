-- Additive accounting UX fields for traceable transaction metadata.
-- Run manually in Supabase after reviewing the verification queries below.

do $$
declare
  clients_id_type text;
  invoices_id_type text;
begin
  select data_type into clients_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'clients' and column_name = 'id';

  select data_type into invoices_id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'invoices' and column_name = 'id';

  if clients_id_type is distinct from 'uuid' then
    raise exception 'Expected public.clients.id to be uuid, found %', coalesce(clients_id_type, 'missing');
  end if;

  if invoices_id_type is distinct from 'uuid' then
    raise exception 'Expected public.invoices.id to be uuid, found %', coalesce(invoices_id_type, 'missing');
  end if;
end
$$;

alter table public.incomes
  add column if not exists reference text,
  add column if not exists note text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

alter table public.expenses
  add column if not exists reference text,
  add column if not exists note text,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists payment_method text;

create index if not exists incomes_company_client_idx
  on public.incomes(company_id, client_id) where client_id is not null;
create index if not exists incomes_company_invoice_idx
  on public.incomes(company_id, invoice_id) where invoice_id is not null;
create index if not exists expenses_company_client_idx
  on public.expenses(company_id, client_id) where client_id is not null;
create index if not exists expenses_company_invoice_idx
  on public.expenses(company_id, invoice_id) where invoice_id is not null;

-- Existing table RLS applies to these nullable columns. No new policy is needed.
-- Verification:
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('incomes', 'expenses', 'clients', 'invoices')
--   and column_name in ('id', 'reference', 'note', 'client_id', 'invoice_id', 'payment_method')
-- order by table_name, ordinal_position;
--
-- select indexname, indexdef from pg_indexes
-- where schemaname = 'public'
--   and indexname in (
--     'incomes_company_client_idx', 'incomes_company_invoice_idx',
--     'expenses_company_client_idx', 'expenses_company_invoice_idx'
--   );
--
-- Rollback notes (manual and data-destructive): remove the four indexes first, then
-- remove the five columns from each transaction table only after exporting their data.
-- No rollback SQL is executed automatically.
