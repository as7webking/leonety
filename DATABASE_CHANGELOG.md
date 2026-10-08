# Leonety Database Changelog

This document is the human-readable deployment ledger for Leonety database work.
It does not replace executable migrations. `supabase/migrations/` remains the
version-controlled source of database changes.

Status meanings:

- `APPLIED`: production application and verification are explicitly confirmed.
- `READY TO APPLY`: reviewed migration is ready for a manual production change.
- `PENDING`: designed or implemented but not ready for production application.
- `BLOCKED`: must not be applied until the stated problem is resolved.
- `SUPERSEDED`: replaced by a later migration and not intended for application.
- `UNKNOWN`: repository evidence does not prove production deployment.

## Current Database Actions

### BLOCKED

- `supabase/migrations/leonety_consolidated_schema.sql`: do not apply as a fresh
  production migration. Its filename has no Supabase timestamp, linked migration
  history is empty, and the file assumes core tables that it does not create.
- Active timers: reconcile the current SQL definition with the application and live
  catalog. The file creates `active_timers` without `user_id`, while its trigger and
  the application query `user_id`.
- Legal settings: reconcile the 15 legal columns used by
  `src/app/api/workspaces/legal/route.ts` with a reviewed, timestamped migration.
  They are not represented in the current repository migration.
- Global operator user directory: keep blocked until
  `20261008221134_secure_admin_accounts.sql` has been manually reviewed, applied and
  verified. The existing consolidated file creates `admin_accounts` without enabling
  RLS or revoking browser-role grants.
- Mailbox connections: deployment may not be inferred from SQL or the Git commit
  title. Verify the object in the live catalog before recording it as applied or
  preparing any repair.

### PENDING

- Employee Personalnummer: inspect production first, then use
  `supabase/migrations/20261008233000_employee_numbers.sql` only if the audited
  objects are absent or compatible. This timestamped file corrects the counter
  padding bug in Edit 4 while retaining the same schema. Do not apply the entire
  consolidated file or apply both definitions independently.

### READY TO APPLY

- `20261008221134_secure_admin_accounts.sql`: enable RLS on the Leonety operator
  allowlist and revoke all direct `public`/`anon`/`authenticated` privileges while
  retaining the minimum server `service_role` privileges. Manual review and
  production application are required; status remains unapplied.

### PENDING DEVELOPMENT

- Create a trustworthy timestamped baseline for fresh environments from an audited
  schema source. Do not reconstruct production by replaying the consolidated file.
- Prepare one reviewed additive repair only after read-only production inspection
  establishes the actual differences.

### NO ACTION REQUIRED

- Do not reset, push, repair, or rewrite production migration history merely to make
  the local migration list look complete.
- Do not add migrations to `.gitignore`; new database changes should remain reviewed
  and version controlled.

## Evidence And Limitations

- Current migration directory: one file,
  `supabase/migrations/leonety_consolidated_schema.sql`.
- The Supabase CLI skips that file because it does not match
  `<timestamp>_name.sql`.
- The linked migration list returned no local/remote versions.
- A queried `supabase_migrations.schema_migrations` relation was not present. Tables
  named `schema_migrations` exist in other Supabase-managed schemas, but they are not
  evidence of Leonety application migration deployment.
- Git records SQL changes and consolidation, but a commit message such as “Record
  applied...” is not independent production verification.
- The 2026-09-13 audit reports that production contained objects not reconstructible
  from the then-available migration archive and was likely changed with manual SQL.
- Consequently, all production statuses below remain `UNKNOWN` until verified from
  the live catalog and an explicit deployment record.

## Chronological Change History

### 2026-04-15 - Active timers and workspace timer RPCs

- **Status:** `BLOCKED`
- **Migration filename:** historical
  `migrations/20260415_active_timers_workspace.sql` and
  `migrations/20260415_active_timers_pause_and_limit.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** workspace timers, pause/resume/stop RPCs, timer limits, owner-scoped
  access.
- **Main objects:** `active_timers`; `start_active_timer`, `pause_active_timer`,
  `resume_active_timer`, `stop_active_timer`, `enforce_active_timer_limit`.
- **Production status:** `UNKNOWN`
- **Verification status:** repository inconsistency confirmed; live final definition
  still requires authoritative verification.
- **Notes/dependencies:** depends on `companies`, `time_entries`, and `auth.uid()`.
  Current consolidated DDL omits `active_timers.user_id` while later logic requires it.

### 2026-04-15 - Finance exchange-rate snapshots and timer start RPC

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260415_exchange_rates_and_timer_start_rpc.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** add `exchange_rate` and `workspace_currency` snapshots to income and
  expenses; provide server-checked timer start.
- **Main objects:** `incomes`, `expenses`, `start_active_timer`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** assumes the core finance tables already exist.

### 2026-05-09 - Timer history

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260509_timer_history_original_start.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** preserve original timer start and completion timestamps.
- **Main objects:** `active_timers.original_started_at`,
  `time_entries.timer_started_at`, `time_entries.timer_completed_at`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** depends on the unresolved active-timer shape.

### 2026-05-09 - User subscriptions

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260509_user_subscriptions.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** user-level subscription state and operator account records.
- **Main objects:** `user_subscriptions`, `admin_accounts`.
- **Production status:** `UNKNOWN`
- **Verification status:** `admin_accounts` security remains under audit.
- **Notes/dependencies:** references `auth.users`; it does not modify `auth.users`.

### 2026-06-15 - Employees, locations, shifts, products and stock

- **Status:** `UNKNOWN`
- **Migration filename:** historical alternatives
  `migrations/20260615_operations_inventory.sql` and
  `migrations/20260615_operations_inventory_compact.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** establish operations and inventory entities with owner-scoped RLS.
- **Main objects:** `employees`, `locations`, `shifts`, `products`,
  `stock_movements`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** historical files had conflicting definitions and were not a
  safe sequential pair.

### 2026-06-19 - WooCommerce product integration

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260619_woocommerce_integration.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** WooCommerce connection metadata, product mappings, product images.
- **Main objects:** `woocommerce_connections`, `product_syncs`, product channel
  columns, `storage.buckets`/`storage.objects` policies for `product-images`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** connection credentials are intended for server-only access.

### 2026-06-23 - Billing foundation

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260623_billing_foundation.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** provider customer, subscription, payment, and idempotent webhook-event
  storage.
- **Main objects:** `billing_customers`, `billing_subscriptions`,
  `billing_payments`, `billing_events`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** owner-readable billing rows; events are server-only by
  absence of a client-readable RLS policy.

### 2026-06-27 - Product categories and billing access sync

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260627_product_categories_billing_support.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** canonical product categories and subscription-to-entitlement updates.
- **Main objects:** `product_categories`, `products.category_id`, `app_access`,
  `apply_billing_subscription_to_app_access`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** assumes `app_access` exists in the missing core baseline.

### 2026-07-27 - Store integrations model

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260727_store_integrations_schema_fix.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** normalize provider connection metadata and supported provider states.
- **Main objects:** `store_integrations`, `product_syncs` constraints/indexes.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** credential columns require server-side encryption and
  authorization; actual live protection must be audited separately.

### 2026-08-04 - WhatsApp Business integration records

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260804_whatsapp_business_integration.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** multi-tenant WhatsApp connection metadata and webhook idempotency.
- **Main objects:** `store_integrations`, `whatsapp_webhook_events`, selected client
  source/import columns.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** application also references `whatsapp_business_numbers`,
  which is not created by the current migration.

### 2026-08-29 - Contracts and versions

- **Status:** `UNKNOWN`
- **Migration filename:** historical `migrations/20260829_contract_builder.sql`;
  consolidated into `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** contract records, immutable versions, status and update-time handling.
- **Main objects:** `contracts`, `contract_versions`, `set_contract_updated_at`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** references `companies`, `clients`, and `auth.users`.

### 2026-09-03 - Marketplace channels and accounting links

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260903_food_marketplace_channels.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** provider allowlists, product publication preferences, transaction
  titles, and contract/invoice association.
- **Main objects:** `store_integrations`, `product_syncs`,
  `product_channel_preferences`, `incomes.title`, `expenses.title`,
  `invoices.contract_id`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** provider names in schema do not prove that provider APIs are
  implemented.

### 2026-09-05 - Inventory accounting metadata

- **Status:** `BLOCKED`
- **Migration filename:** historical
  `migrations/20260905_inventory_accounting_links.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** stock audit values, expense linkage, and atomic stock movement RPC.
- **Main objects:** `stock_movements`, `record_stock_movement`.
- **Production status:** `UNKNOWN`
- **Verification status:** identifier type mismatch remains unresolved.
- **Notes/dependencies:** consolidated SQL declares `linked_expense_id bigint`, while
  later SQL asserts `expenses.id` is UUID. Live types must be inspected first.

### 2026-09-13 - Finance editing metadata

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260913_accounting_ux_fields.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** references, notes, client/invoice links, and payment method fields.
- **Main objects:** `incomes`, `expenses`, related indexes.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** contains guards expecting UUID `clients.id` and
  `invoices.id`; historical core definitions conflict on finance ID types.

### 2026-09-14 - Contract, invoice, payment and income linkage

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260914_contract_invoice_transaction_links.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** enforce contract/invoice workspace scope and record paid invoices once
  as income.
- **Main objects:** `contracts`, `invoices`, `invoice_payments`, `incomes`,
  `enforce_invoice_contract_scope`, `record_paid_invoice_income`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** relies on core invoice and finance tables absent from the
  repository baseline.

### 2026-09-15 - Workspace entitlement guard

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260915120000_workspace_entitlement_guard.sql`; consolidated
  into `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** enforce workspace plan limits and retain operator audit events.
- **Main objects:** `admin_audit_events`, `enforce_workspace_entitlement_limit`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** depends on `companies` and `app_access`.

### 2026-09-17 - Employee profile fields

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260917120000_employee_profile_fields.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** employment, compensation, identity, address, and leave fields.
- **Main objects:** additive columns on `employees`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** includes highly sensitive employee fields that must not be
  broadly exposed or cached.

### 2026-09-19 - International employee profile fields

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260919120000_employee_country_profiles.sql`; consolidated
  into `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** country-specific employee profile metadata.
- **Main objects:** additional columns/constraints/indexes on `employees`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** sensitive-data access depends on owner-scoped employee RLS.

### 2026-09-19 - Employee documents

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260919143000_employee_documents.sql`; consolidated into
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** document requirements, private employee document metadata, and
  workspace document settings.
- **Main objects:** `employee_document_requirements`, `employee_documents`,
  `employee_document_settings`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production/storage configuration.
- **Notes/dependencies:** document metadata is sensitive; storage objects and bucket
  policies require separate confirmation.

### 2026-09-19 - Consolidated 2026 repository schema

- **Status:** `BLOCKED`
- **Migration filename:** originally
  `supabase/migrations/20260919205522_consolidated_2026_schema.sql`, renamed to
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** replace split 2026 SQL with one intended final-state file.
- **Main objects:** all 2026 objects listed in this changelog.
- **Production status:** `UNKNOWN`
- **Verification status:** Supabase CLI skips the renamed file; linked migration list
  contains no matching applied version.
- **Notes/dependencies:** incomplete baseline; assumes core tables exist. Do not apply
  to production or treat it as a reproducible fresh-install migration.

### 2026-09-20 - Order notification devices and events

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260920153440_incoming_order_notifications.sql`; consolidated
  into `supabase/migrations/leonety_consolidated_schema.sql` as Edit 2.
- **Purpose:** per-device push subscription storage, workspace settings, and incoming
  order event deduplication.
- **Main objects:** `order_notification_devices`, `order_notification_settings`,
  `incoming_order_alert_events`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** push endpoints and keys are private application data.

### 2026-09-28 - Employee and location weekly schedules

- **Status:** `UNKNOWN`
- **Migration filename:** Edit 3 in
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** per-weekday employee schedules and location operating-hour suggestions.
- **Main objects:** `employee_weekly_schedules`, `location_operating_hours`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** actual shifts remain separate records in `shifts`.

### 2026-10-05 - Workspace employee numbers

- **Status:** `PENDING`
- **Migration filename:** corrected deployment migration
  `supabase/migrations/20261008233000_employee_numbers.sql`; source design is Edit 4
  in `supabase/migrations/leonety_consolidated_schema.sql`.
- **Purpose:** optional workspace-scoped employee numbers and atomic allocation.
- **Main objects:** `employees.employee_number`, `employee_number_settings`, unique
  indexes, initialization/counter/allocation triggers.
- **Production status:** `UNKNOWN`
- **Verification status:** the Edit 4 schema was audited and one counter-formatting
  defect was corrected in the timestamped migration. Production presence remains
  `UNKNOWN`; the migration has not been executed.
- **Notes/dependencies:** allocation locks the workspace settings row and uses a
  workspace-scoped unique index. The corrected formatter avoids PostgreSQL `lpad`
  truncation after the counter exceeds the configured minimum width. Apply only
  after read-only production inspection; do not apply both SQL definitions or use
  client-side `max + 1`.

### 2026-10-06 - Human mailbox connections

- **Status:** `BLOCKED`
- **Migration filename:** Edit 5 in
  `supabase/migrations/leonety_consolidated_schema.sql`
- **Purpose:** owner-only Google mailbox connection metadata with encrypted tokens.
- **Main objects:** `mailbox_connections`, owner policies, revoked client grants,
  updated-at trigger.
- **Production status:** `UNKNOWN`
- **Verification status:** Git contains implementation and an “applied” commit title,
  but no remote migration record or current catalog verification proves deployment.
- **Notes/dependencies:** requires server-side AES-256-GCM handling; message content is
  intentionally not stored.

### Date unknown - Workspace Legal / Impressum columns

- **Status:** `BLOCKED`
- **Migration filename:** not present in `supabase/migrations/`
- **Purpose:** authoritative workspace legal configuration.
- **Main objects:** 15 legal columns expected on `companies` by
  `src/app/api/workspaces/legal/route.ts`.
- **Production status:** `UNKNOWN`
- **Verification status:** application expectation confirmed; repository migration
  coverage missing.
- **Notes/dependencies:** existing production columns must be inspected before any
  additive repair is authored; invoice snapshots are a separate concern.

### 2026-10-08 - Secure operator administrator allowlist

- **Status:** `READY TO APPLY`
- **Migration filename:**
  `supabase/migrations/20261008221134_secure_admin_accounts.sql`
- **Purpose:** make `admin_accounts` server-only before the global auth-user directory
  can be considered safe for production use.
- **Main objects:** `admin_accounts` RLS and table grants.
- **Production status:** `UNKNOWN` (not executed by this task).
- **Verification status:** repository authorization paths audited; manual migration
  application and read-only production verification still required.
- **Notes/dependencies:** current server authorization uses the service-role client;
  no current client component directly queries `admin_accounts`. The migration does
  not alter `auth.users` and deliberately creates no browser policy.

## Future Database Workflow

Every future database-changing feature must:

1. Audit the existing schema and application expectations.
2. Create one timestamped migration when a database change is required.
3. Update `DATABASE_CHANGELOG.md`.
4. Update `DATABASE_SCHEMA.md` when architecture changes.
5. Receive manual migration review.
6. Be applied through an explicitly approved process.
7. Be verified against the target database.
8. Change changelog status to `APPLIED` only after that confirmation.

Do not use a permanently overwritten `UPD.sql`. Do not add migrations to
`.gitignore`.
