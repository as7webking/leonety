# Leonety Database Changelog

This document is the human-readable deployment ledger for Leonety database work.
It does not replace executable migrations. `supabase/migrations/` remains the
version-controlled source of database changes.

The SQL files in this directory currently use timestamp-only filenames for
manual copy/paste into the Supabase SQL editor. They are not recognized as
Supabase CLI migrations because the CLI requires a descriptive suffix after the
timestamp. Renaming files does not mean their SQL has been applied.

Status meanings:

- `APPLIED`: production application and verification are explicitly confirmed.
- `READY TO APPLY`: reviewed migration is ready for a manual production change.
- `PENDING`: designed or implemented but not ready for production application.
- `BLOCKED`: must not be applied until the stated problem is resolved.
- `SUPERSEDED`: replaced by a later migration and not intended for application.
- `UNKNOWN`: repository evidence does not prove production deployment.

## Current Database Actions

### BLOCKED

- `supabase/migrations/20260919205522.sql`: do not apply as a fresh
  production migration. It is a consolidated baseline with incomplete core DDL;
  production migration history is not verified. Its timestamp-only filename is
  also not recognized by the Supabase CLI.
- Admin routine security sign-off: production confirms restrictive
  `admin_accounts` RLS/grants, but the exact production definition of
  `is_current_user_admin` was not included in the inspection output and no repository
  definition exists. Do not claim full routine verification until its definition and
  execute ACL are reviewed.

### PENDING

- Product image PNG/WebP storage support: `20261028120000_product_image_formats.sql`
  adds `image/png` and `image/webp` to the existing `product-images` bucket MIME
  allowlist while preserving other configured types. Do not mark APPLIED until
  manually executed and verified in production.
- Employee number formatting migration `20261008233000.sql`: production already has
  the employee number, settings, workspace-scoped uniqueness and RLS. Migration
  history remains unknown; review the counter-padding correction separately before
  considering manual application. Do not apply the schema proposal blindly.
- Employee shift overlap protection: inspect production shifts for existing
  overlaps, then review `supabase/migrations/20261009120000.sql`.
  It adds a transaction-serialized trigger; it has not been applied or verified.
- Activity tracking `20261010150000.sql`: production migration-history status remains
  unknown; the production inspection supplied for this cycle did not cover this
  object.
- Urgent order acknowledgement/escalation: review
  `supabase/migrations/20261012170000.sql`.
  It depends on the existing `incoming_order_alert_events` and
  `order_notification_settings` objects; verify those live tables/columns first.
  The new code requires these fields and `CRON_SECRET` before deployment. The
  migration has not been executed or production-verified.

### READY TO APPLY

- `supabase/migrations/20261015100000.sql`: add nullable `text` column
  `public.product_syncs.external_url`. Production inspection confirmed this column
  is missing. This is the only migration needed for the verified findings in this
  task; manually review it before execution.

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

- `supabase/migrations/` contains consolidated SQL and timestamped migration
  proposals. The current timestamp-only filenames are skipped by Supabase CLI
  because they do not match `<timestamp>_name.sql`; they are maintained for manual
  SQL editor copy/paste.
- The linked migration list returned no local/remote versions.
- A queried `supabase_migrations.schema_migrations` relation was not present. Tables
  named `schema_migrations` exist in other Supabase-managed schemas, but they are not
  evidence of Leonety application migration deployment.
- Git records SQL changes and consolidation, but a commit message such as “Record
  applied...” is not independent production verification.
- The 2026-09-13 audit reports that production contained objects not reconstructible
  from the then-available migration archive and was likely changed with manual SQL.
- A read-only production catalog inspection was supplied on 2026-10-20. It confirms
  selected current schema/security properties, but does not prove which local SQL
  files were applied or when. Production object state and migration-history state
  are recorded separately below.

## Production Verification Snapshot - 2026-10-20

These are production catalog findings, not migration-history claims:

- `admin_accounts`: RLS enabled; `anon` and `authenticated` have no effective table
  privileges; `service_role` has access; the policy permits selecting the caller's
  own admin row; no table trigger was found. Routine `is_current_user_admin` still
  needs its exact production definition and execute ACL reviewed.
- `active_timers.user_id` exists and references `auth.users(id)`; `company_id` is a
  required UUID FK and `accumulated_seconds` is a required integer. This corrects the
  old production claim that `user_id` was absent. The consolidated repository SQL
  still has an internal omission and is not a safe fresh baseline.
- All Legal/Impressum fields selected by
  `src/app/api/workspaces/legal/route.ts` are present on `companies`.
- `invoices.currency`, `invoices.document_snapshot` (JSONB), and invoice snapshot
  protection/requirement triggers are present. No snapshot migration is needed now;
  this does not mark a local migration applied.
- Income and expense currency snapshot fields are present. Historical finance values
  must not be recalculated.
- `employees.employee_number`, required `employee_number_settings` fields,
  workspace-scoped uniqueness and relevant RLS policies are present.
- `mailbox_connections` has the current application columns and supports the current
  multi-provider architecture. Do not apply the obsolete Google-only migration.
- `product_syncs.external_url` is missing. The existing nullable additive migration
  below is ready for manual review/application.

## Chronological Change History

### 2026-10-15 - Persist external product URLs for channel mappings

- **Status:** `READY TO APPLY`
- **Migration filename:** `supabase/migrations/20261015100000.sql`
- **Purpose:** retain the actual public product URL returned by the provider, so
  Leonety can link to a published external item without constructing a URL from an
  external ID.
- **Main objects:** nullable `product_syncs.external_url`.
- **Production status:** `MISSING` (confirmed by read-only inspection on 2026-10-20).
- **Verification status:** application use confirmed; the existing migration is
  additive/idempotent. It is `READY TO APPLY`, not `APPLIED`.
- **Notes/dependencies:** old mappings remain NULL and do not receive fabricated
  URLs. No existing mapping or transaction data is rewritten.

### 2026-04-15 - Active timers and workspace timer RPCs

- **Status:** `BLOCKED`
- **Migration filename:** historical
  `migrations/20260415_active_timers_workspace.sql` and
  `migrations/20260415_active_timers_pause_and_limit.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
- **Purpose:** workspace timers, pause/resume/stop RPCs, timer limits, owner-scoped
  access.
- **Main objects:** `active_timers`; `start_active_timer`, `pause_active_timer`,
  `resume_active_timer`, `stop_active_timer`, `enforce_active_timer_limit`.
- **Production status:** `active_timers.user_id` exists and references
  `auth.users(id)` (verified 2026-10-20); migration-history status remains `UNKNOWN`.
- **Verification status:** the production field is present; repository migration has
  an internal inconsistency.
- **Notes/dependencies:** depends on `companies`, `time_entries`, and `auth.uid()`.
  The consolidated repository DDL still omits `active_timers.user_id` while later
  logic requires it; this is a repository baseline defect, not current production
  schema state.

### 2026-04-15 - Finance exchange-rate snapshots and timer start RPC

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260415_exchange_rates_and_timer_start_rpc.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
- **Purpose:** user-level subscription state and operator account records.
- **Main objects:** `user_subscriptions`, `admin_accounts`.
- **Production status:** `UNKNOWN`
- **Verification status:** production RLS and effective table privileges for
  `admin_accounts` were verified on 2026-10-20. Routine-level review of the
  production `is_current_user_admin` definition/ACL remains open.
- **Notes/dependencies:** references `auth.users`; it does not modify `auth.users`.

### 2026-06-15 - Employees, locations, shifts, products and stock

- **Status:** `UNKNOWN`
- **Migration filename:** historical alternatives
  `migrations/20260615_operations_inventory.sql` and
  `migrations/20260615_operations_inventory_compact.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  consolidated into `supabase/migrations/20260919205522.sql`
- **Purpose:** contract records, immutable versions, status and update-time handling.
- **Main objects:** `contracts`, `contract_versions`, `set_contract_updated_at`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** references `companies`, `clients`, and `auth.users`.

### 2026-09-03 - Marketplace channels and accounting links

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `migrations/20260903_food_marketplace_channels.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  into `supabase/migrations/20260919205522.sql`
- **Purpose:** enforce workspace plan limits and retain operator audit events.
- **Main objects:** `admin_audit_events`, `enforce_workspace_entitlement_limit`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** depends on `companies` and `app_access`.

### 2026-09-17 - Employee profile fields

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260917120000_employee_profile_fields.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
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
  into `supabase/migrations/20260919205522.sql`
- **Purpose:** country-specific employee profile metadata.
- **Main objects:** additional columns/constraints/indexes on `employees`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** sensitive-data access depends on owner-scoped employee RLS.

### 2026-09-19 - Employee documents

- **Status:** `UNKNOWN`
- **Migration filename:** historical
  `supabase/migrations/20260919143000_employee_documents.sql`; consolidated into
  `supabase/migrations/20260919205522.sql`
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
  `supabase/migrations/20260919205522.sql`
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
  into `supabase/migrations/20260919205522.sql` as Edit 2.
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
  `supabase/migrations/20260919205522.sql`
- **Purpose:** per-weekday employee schedules and location operating-hour suggestions.
- **Main objects:** `employee_weekly_schedules`, `location_operating_hours`.
- **Production status:** `UNKNOWN`
- **Verification status:** not verified against production.
- **Notes/dependencies:** actual shifts remain separate records in `shifts`.

### 2026-10-05 - Workspace employee numbers

- **Status:** `PENDING`
- **Migration filename:** corrected deployment migration
  `supabase/migrations/20261008233000.sql`; source design is Edit 4
  in `supabase/migrations/20260919205522.sql`.
- **Purpose:** optional workspace-scoped employee numbers and atomic allocation.
- **Main objects:** `employees.employee_number`, `employee_number_settings`, unique
  indexes, initialization/counter/allocation triggers.
- **Production status:** employee number, settings columns, workspace-scoped unique
  index and relevant RLS policies are `PRESENT` (verified 2026-10-20); migration
  history remains `UNKNOWN`.
- **Verification status:** the Edit 4 schema was audited and one counter-formatting
  defect was corrected in the timestamped migration. Production has the architecture,
  but this does not prove the timestamped migration was applied.
- **Notes/dependencies:** allocation locks the workspace settings row and uses a
  workspace-scoped unique index. The corrected formatter avoids PostgreSQL `lpad`
  truncation after the counter exceeds the configured minimum width. Review this
  narrow formatting correction separately; do not reapply the schema blindly or use
  client-side `max + 1`.

### 2026-10-09 - Concurrent employee shift overlap protection

- **Status:** `PENDING`
- **Migration filename:**
  `supabase/migrations/20261009120000.sql`
- **Purpose:** prevent concurrent requests from creating overlapping shifts for
  the same employee on the same calendar date.
- **Main objects:** `public.prevent_employee_shift_overlap()` and
  `trg_prevent_employee_shift_overlap` on `public.shifts`.
- **Production status:** `UNKNOWN`; migration has not been executed.
- **Verification status:** based on repository DDL only. Inspect the live
  `shifts` schema and existing overlap records before manual application.
- **Notes/dependencies:** retains the exact-duplicate unique index, ignores
  cancelled shifts, follows employee/day conflict scope and does not alter
  columns, RLS, or overnight-shift semantics.

### 2026-10-06 - Human mailbox connections

- **Status:** `SUPERSEDED` as a deployment source; retained only as historical
  consolidated SQL.
- **Migration filename:** Edit 5 in
  `supabase/migrations/20260919205522.sql`; do not apply this file.
- **Purpose:** owner-only Google mailbox connection metadata with encrypted tokens.
- **Main objects:** historical proposal for `mailbox_connections`, owner policies,
  revoked client grants, updated-at trigger.
- **Production status:** `UNKNOWN`
- **Verification status:** no remote migration record or current catalog verification
  proves deployment.
- **Notes/dependencies:** requires server-side AES-256-GCM handling; message content is
  intentionally not stored.

### 2026-10-09 - Finalized invoice document snapshots

- **Status:** production schema `CONFIRMED`; migration history `UNKNOWN`.
- **Migration filename:**
  `supabase/migrations/20261009160000.sql`
- **Purpose:** preserve seller, buyer and template presentation when a draft first
  becomes non-draft, without duplicating persisted invoice amounts or line items.
- **Main objects:** nullable `invoices.document_snapshot` JSONB column and trigger
  preventing changes after a non-null snapshot has been stored.
- **Production status:** `invoices.currency`, JSONB `document_snapshot`, and
  snapshot protection/requirement triggers are `PRESENT` (verified 2026-10-20).
- **Verification status:** production catalog verified; no invoice snapshot schema
  migration is needed now. Local migration history remains unknown, so the proposal
  is not marked `APPLIED`.
- **Notes/dependencies:** deliberately performs no historical backfill; old issued
  invoices without a snapshot retain a clearly disclosed live-data print fallback.

### 2026-10-10 - Timestamped Google mailbox connection schema

- **Status:** `SUPERSEDED` as a deployment source by the verified production
  multi-provider architecture; migration-history identity remains `UNKNOWN`.
- **Migration filename:** `supabase/migrations/20261010130000.sql`
- **Purpose:** provide a deployable, additive owner-scoped connection model for the
  first Google human mailbox provider.
- **Main objects:** `public.mailbox_connections`, owner RLS policies, server-only
  grants, two lookup/uniqueness indexes, and an `updated_at` trigger.
- **Production status:** current application columns and multi-provider architecture
  are `PRESENT` (verified 2026-10-20); migration-history status is `UNKNOWN`.
- **Verification status:** production already has a newer multi-provider table. Do
  not apply this obsolete Google-only schema. The local migration is not marked
  applied because deployment identity is unproven.
- **Notes/dependencies:** tokens use existing `LEONETY_CREDENTIAL_ENCRYPTION_KEY`
  AES-256-GCM encryption. No Gmail message content is stored. The migration aborts
  if required company UUID columns are absent or incompatible.

### 2026-10-12 - Multi-provider mailbox connections and plan slots

- **Status:** production schema `CONFIRMED`; migration history `UNKNOWN`.
- **Migration filename:** `supabase/migrations/20261012120000.sql`
- **Purpose:** extend the existing pending mailbox connection model for Microsoft
  OAuth and encrypted TLS-only IMAP/SMTP settings; retain credentials through plan
  downgrades while enforcing per-workspace slot limits atomically.
- **Main objects:** additional display/account/configuration columns, provider and
  status constraints, one lookup index, and service-role-only atomic create/activate
  functions.
- **Production status:** current application columns and multi-provider support are
  `PRESENT` (verified 2026-10-20); migration-history status is `UNKNOWN`.
- **Verification status:** production has the current architecture. Do not replay the
  Google-only prerequisite or apply this SQL without comparing each operation to the
  live table; its history identity is not confirmed.
- **Notes/dependencies:** the migration drops/replaces only mailbox provider,
  credential-format, scope and status checks so the same table accepts the added
  providers. Existing owner RLS and server-only table grants remain unchanged.
  It stores no message content. The SQL is a proposal, not a production action.

### 2026-10-12 - Immutable transaction currency snapshots

- **Status:** production schema `CONFIRMED`; migration history `UNKNOWN`.
- **Migration filename:** `supabase/migrations/20261012150000.sql`
- **Purpose:** store the workspace-currency amount and provider/date metadata beside
  the original amount/currency for newly created or explicitly repriced income and
  expense records.
- **Main objects:** nullable `workspace_amount`, `exchange_rate_source`,
  `exchange_rate_at`, and `exchange_rate_date` columns on `incomes` and `expenses`.
- **Production status:** current income and expense currency snapshot fields are
  `PRESENT` (verified 2026-10-20); migration-history status is `UNKNOWN`.
- **Verification status:** production column presence is confirmed. No currency
  snapshot migration is needed now; historical amounts must not be recalculated.
- **Notes/dependencies:** relies on existing `exchange_rate` and
  `workspace_currency` columns. No old rows are backfilled or recalculated. The
  corresponding production columns are present; the local migration is not marked
  applied because deployment identity remains unknown.

### 2026-10-10 - Coarse Leonety user activity

- **Status:** `PENDING`
- **Migration filename:** `supabase/migrations/20261010150000.sql`
- **Purpose:** persist a coarse last-use timestamp for operator diagnostics without
  changing authentication sign-in semantics or creating an event log.
- **Main objects:** `public.user_activity` and the server-only
  `record_leonety_user_activity(uuid)` RPC.
- **Production status:** `UNKNOWN`; migration was not executed.
- **Verification status:** repository-defined only. Verify RLS, table grants and RPC
  execution privileges after manual application.
- **Notes/dependencies:** writes are atomically limited to once per user per five
  minutes. `auth.users` is referenced but not modified.

### Date unknown - Workspace Legal / Impressum columns

- **Status:** production schema `CONFIRMED`; migration history `UNKNOWN`.
- **Migration filename:** not present in `supabase/migrations/`
- **Purpose:** authoritative workspace legal configuration.
- **Main objects:** 15 legal columns expected on `companies` by
  `src/app/api/workspaces/legal/route.ts`.
- **Production status:** all application-required Legal columns are `PRESENT`
  (verified 2026-10-20).
- **Verification status:** no repair migration is required for these fields. This
  does not identify which SQL or manual action introduced them.
- **Notes/dependencies:** Legal fields and invoice document snapshots are separate.

### 2026-10-08 - Secure operator administrator allowlist

- **Status:** migration history `UNKNOWN`; equivalent restrictive production state
  confirmed.
- **Migration filename:**
  `supabase/migrations/20261008221134.sql`
- **Purpose:** make `admin_accounts` server-only before the global auth-user directory
  can be considered safe for production use.
- **Main objects:** `admin_accounts` RLS and table grants.
- **Production status:** RLS enabled, no effective `anon`/`authenticated` table
  privileges, `service_role` access, self-row SELECT policy, and no table trigger
  (verified 2026-10-20).
- **Verification status:** production catalog state confirmed. The migration is not
  marked applied because no migration-history evidence maps it to production. The
  production routine `is_current_user_admin` still needs its exact definition/ACL
  reviewed.
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
