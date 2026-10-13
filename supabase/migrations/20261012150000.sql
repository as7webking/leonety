-- Add immutable base-currency conversion snapshots for new/explicitly edited
-- income and expense records. Existing rows are intentionally not backfilled:
-- their historical conversion cannot be reconstructed safely.
alter table public.incomes
  add column if not exists workspace_amount numeric(20,8),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_at timestamptz,
  add column if not exists exchange_rate_date date;

alter table public.expenses
  add column if not exists workspace_amount numeric(20,8),
  add column if not exists exchange_rate_source text,
  add column if not exists exchange_rate_at timestamptz,
  add column if not exists exchange_rate_date date;

comment on column public.incomes.workspace_amount is 'Immutable workspace-currency amount captured with the transaction FX snapshot; NULL means no verified snapshot is available.';
comment on column public.expenses.workspace_amount is 'Immutable workspace-currency amount captured with the transaction FX snapshot; NULL means no verified snapshot is available.';
comment on column public.incomes.exchange_rate_source is 'Provider or identity conversion source captured with the transaction.';
comment on column public.expenses.exchange_rate_source is 'Provider or identity conversion source captured with the transaction.';
