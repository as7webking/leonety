-- Add optional workspace, customer and invoice-item presentation fields.
-- Existing records remain NULL; this migration performs no backfill.
begin;

alter table public.companies
  add column if not exists legal_form text,
  add column if not exists tax_number text,
  add column if not exists account_holder text,
  add column if not exists bank_name text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists payment_terms text;

alter table public.clients
  add column if not exists vat_id text;

alter table public.invoices
  add column if not exists payment_terms text;

alter table public.invoice_items
  add column if not exists unit text;

comment on column public.companies.legal_form is
  'Optional legal form for seller presentation; not inferred from the company name.';
comment on column public.companies.tax_number is
  'Seller Steuernummer, stored separately from vat_id.';
comment on column public.companies.account_holder is
  'Optional payee name shown with invoice bank details; not a credential.';
comment on column public.companies.bank_name is
  'Optional bank name shown on invoices; not a credential.';
comment on column public.companies.iban is
  'Optional seller IBAN for invoice payment instructions.';
comment on column public.companies.bic is
  'Optional seller BIC/SWIFT for invoice payment instructions.';
comment on column public.companies.payment_terms is
  'Optional workspace default payment-terms text for future invoices.';
comment on column public.clients.vat_id is
  'Customer VAT identification number, stored separately from tax_number.';
comment on column public.invoices.payment_terms is
  'Payment-terms text captured for this invoice; distinct from due_date.';
comment on column public.invoice_items.unit is
  'Optional presentation unit for this invoice line; does not change quantity or totals.';

commit;
