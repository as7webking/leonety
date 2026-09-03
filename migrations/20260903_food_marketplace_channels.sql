-- Leonety food marketplace channel identifiers.
-- Safe to re-run. Non-destructive: expands provider/channel allowlists only.

alter table public.store_integrations
  drop constraint if exists store_integrations_provider_check;

alter table public.store_integrations
  add constraint store_integrations_provider_check
  check (
    provider in (
      'woocommerce',
      'shopify',
      'opencart',
      'google_merchant',
      'whatsapp_business',
      'iss_pos',
      'uber_eats',
      'just_eat_takeaway',
      'glovo'
    )
  );

do $$
begin
  if to_regclass('public.product_syncs') is not null then
    alter table public.product_syncs
      drop constraint if exists product_syncs_channel_check;

    alter table public.product_syncs
      add constraint product_syncs_channel_check
      check (
        channel in (
          'woocommerce',
          'shopify',
          'opencart',
          'google_merchant',
          'iss_pos',
          'uber_eats',
          'just_eat_takeaway',
          'glovo',
          'facebook_instagram',
          'tiktok_shop'
        )
      );
  end if;
end $$;

create index if not exists store_integrations_food_marketplace_idx
  on public.store_integrations(company_id, provider, merchant_id)
  where provider in ('uber_eats', 'just_eat_takeaway', 'glovo');

-- Verification:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname in ('store_integrations_provider_check', 'product_syncs_channel_check');
--
-- Rollback note:
-- To roll back, restore the previous provider/channel check constraints.
-- Do not delete rows unless you intentionally want to remove marketplace connections.
