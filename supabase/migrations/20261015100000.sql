-- Persist only the provider-returned public product URL for a channel mapping.
alter table public.product_syncs
  add column if not exists external_url text;
