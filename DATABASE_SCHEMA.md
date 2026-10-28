# Leonety Database Schema

This document describes the current intended Leonety database architecture from
repository evidence. It is not executable SQL and does not replace
`supabase/migrations/`.

Evidence labels:

- `REPOSITORY DEFINED`: directly defined by a repository migration.
- `CONFIRMED`: legacy label used below for a structure declared in repository SQL;
  it does not imply production application.
- `PRODUCTION VERIFIED`: confirmed by the read-only production catalog results
  supplied for this stabilization cycle (2026-10-20).
- `APPLICATION EXPECTATION`: referenced by current application code but not fully
  defined by the repository migration.
- `PENDING MIGRATION`: a reviewed migration file exists but has not been confirmed
  applied; equivalent production schema alone does not change this status.
- `UNKNOWN`: production shape or security state requires live catalog inspection.

Labels distinguish production object state from repository/migration history. The
current repository cannot reproduce the full production database from scratch.

## Architecture Summary

- Supabase Auth owns authenticated identities in `auth.users`; Leonety migrations
  must not alter or expose that table to normal users.
- `companies` is the workspace boundary. Most current authorization checks use
  `companies.owner_id = auth.uid()`.
- Core identity, workspace, client, finance, and invoice tables are assumed by the
  consolidated migration rather than created by it.
- Most newer workspace tables use `company_id` foreign keys and owner-scoped RLS.
- Sensitive provider credentials are intended for server-side access only. Their
  production grants and encryption state must be verified independently.

## Identity And Profiles

### `auth.users` - Supabase-managed identity

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** authentication identities managed by Supabase.
- **Primary key:** `id` (UUID, inferred from repository foreign keys).
- **Important relationships:** referenced by profiles, billing, admin, employee
  audit, contract authorship, and other ownership/audit fields.
- **RLS model:** Supabase-managed; Leonety must not modify or expose it directly.
- **Modules:** authentication and server-only operator user administration.

### `profiles`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** public application profile linked to an authenticated user.
- **Primary key / columns:** application queries expect `id` plus profile fields;
  complete authoritative DDL is absent from the current migration.
- **Foreign keys/indexes/RLS:** `UNKNOWN` pending live catalog inspection.
- **Modules:** profile, locale/account presentation, admin user directory.

## Workspaces And Access

### `companies`

- **Evidence:** `PRODUCTION VERIFIED` for application-required Legal columns;
  base-table details otherwise remain application expectations.
- **Purpose:** Leonety workspace/company boundary.
- **Primary key:** application and migration references expect UUID `id`.
- **Important columns:** `owner_id`, `name`, `currency`, timestamps, plus application
  expectations for legal fields:
  `legal_name`, `legal_representative`, `legal_street`, `legal_house_number`,
  `legal_postal_code`, `legal_city`, `legal_country_code`, `legal_email`,
  `legal_phone`, `vat_id`, `commercial_register`, `register_court`,
  `registration_number`, `professional_regulatory_info`,
  `additional_legal_text`.
- **Foreign keys:** `owner_id` is expected to reference `auth.users.id`.
- **Indexes/RLS:** not established by the supplied Legal-column inspection.
- **Modules:** workspace selection/settings, nearly all workspace-owned data.
- **Legal fields:** all 15 fields selected by
  `src/app/api/workspaces/legal/route.ts` are present in production. They are not
  represented by the current repository migration; no production repair is needed.

### `app_access`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** workspace entitlement/tier state.
- **Important columns:** migration logic expects `company_id`, `tier`,
  `manual_override`, `active`, `expires_at`, `updated_at`.
- **Indexes:** consolidated SQL adds a unique index on `company_id`.
- **Functions:** updated by `apply_billing_subscription_to_app_access`; consulted by
  `enforce_workspace_entitlement_limit`.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** plans, access limits, billing synchronization.

### `user_subscriptions`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** user-level plan state for operator controls.
- **Primary key:** `user_id` -> `auth.users.id`.
- **Important columns:** `plan`, `status`, `source`, `current_period_end`,
  `updated_by`, timestamps.
- **RLS:** enabled; users may select only their own row.
- **Modules:** subscription/admin access.

### `upgrade_requests`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** persisted workspace upgrade requests.
- **Important columns:** application expects `id`, `user_id`, `company_id`,
  `requested_plan`, `status`, `message`, review fields, timestamps.
- **DDL/RLS/indexes:** `UNKNOWN`; table is not represented by the current migration.
- **Modules:** plan upgrade request flow and operator review.

## Clients

### `clients`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** workspace customers and contact/address metadata.
- **Primary key:** later migration guards expect UUID `id`.
- **Important columns:** application queries include `company_id`, `name`, `email`,
  `phone`, company/address/tax/contact/status fields and timestamps. Consolidated SQL
  conditionally adds `source`, `external_id`, `first_contact_at`, `import_metadata`.
- **Foreign keys:** `company_id` -> `companies.id` is expected.
- **Indexes:** consolidated SQL conditionally adds `(company_id, source, external_id)`.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** clients, invoices, contracts, finance relations, imports.

## Finance And Time

### `incomes` and `expenses`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** workspace income and expense records.
- **Primary key:** unresolved historical evidence conflicts between bigint and UUID.
- **Important columns:** application expects workspace/user ownership, amount,
  currency, date, category/title/description, and timestamps. Consolidated SQL adds
  `exchange_rate`, `workspace_currency`, `title`, `reference`, `note`, `client_id`,
  `invoice_id`, and `payment_method`.
- **Currency snapshot fields:** `workspace_amount`, `exchange_rate_source`,
  `exchange_rate_at`, and `exchange_rate_date` are present on both tables in
  production (`PRODUCTION VERIFIED`, 2026-10-20). The corresponding migration's
  application history remains `UNKNOWN`.
- **Foreign keys:** expected links to `companies`, `clients`, and `invoices`.
- **Indexes:** workspace/client and workspace/invoice indexes are declared.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** income, expenses, transactions, dashboard, Kassenbuch.
- **Concern:** identifier types must be read from production before a repair.
- **Currency semantics:** original `amount`/`currency` remain authoritative. New
  entries store a separate immutable workspace/base amount and rate snapshot;
  changing future FX rates must never update either value. A legacy foreign-currency
  row without `workspace_amount` has no verified base conversion and must not be
  converted using current rates.

### `time_entries`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** completed time tracking records.
- **Important columns:** timer RPC expects `user_id`, `company_id`, `description`,
  `hours`, `date`, `timer_started_at`, `timer_completed_at`.
- **DDL/RLS:** base definition is absent; production state `UNKNOWN`.
- **Modules:** time tracking.

### `active_timers`

- **Evidence:** `PRODUCTION VERIFIED` for `user_id`, `company_id`, and
  `accumulated_seconds`; repository consolidated SQL still has a shape mismatch.
- **Purpose:** in-progress workspace timers.
- **Primary key:** UUID `id`.
- **Production columns:** `user_id` UUID FK to `auth.users(id)`, required UUID
  `company_id` FK, and required integer `accumulated_seconds`. Repository definition
  also creates `description`, `started_at`, `created_at`; later SQL adds
  `paused_at` and `original_started_at`.
- **Repository mismatch:** consolidated `CREATE TABLE` omits `user_id` although
  later trigger/application logic uses it. This is not a production defect according
  to the supplied inspection; do not replay the baseline to production.
- **Indexes:** company and start-time indexes; the file drops an older user uniqueness
  constraint.
- **RLS:** enabled; owner-scoped policies through `companies.owner_id`.
- **Functions/triggers:** start, pause, resume, stop, timer-limit trigger.
- **Modules:** time tracking.

## Invoices

### `invoices`

- **Evidence:** `PRODUCTION VERIFIED` for `currency`, JSONB `document_snapshot`, and
  snapshot protection/requirement triggers; remaining base fields are application
  expectations.
- **Purpose:** canonical invoice records.
- **Primary key:** later guards expect UUID `id`.
- **Important columns:** application expects company/client identifiers, invoice
  number, status, dates, currency, canonical totals and payment state. Consolidated
  SQL adds `contract_id`.
- **Foreign keys:** expected links to `companies`, `clients`; optional contract link.
- **Indexes:** company/contract index declared.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** invoices, print/PDF rendering, contracts, finance.
- **Snapshot:** nullable `document_snapshot` JSONB exists in production, with
  protection/requirement triggers. Local migration-history status remains `UNKNOWN`;
  do not apply another snapshot migration based only on repository history.
  It stores seller/buyer presentation and template identity only; canonical totals
  and line items remain in their existing invoice records. No historical backfill
  is safe without verified source data.

### `invoice_items`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** canonical invoice line items.
- **Important columns:** invoice relation, description, quantity, unit price and tax
  values are expected by the invoice application.
- **DDL/RLS/indexes:** `UNKNOWN`; no current repository migration creates it.
- **Modules:** invoice editor, calculations, rendering.

### `invoice_payments`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** payments associated with invoices.
- **Important columns:** application/RPC logic expects invoice/company relationship,
  payment amount/state and timestamps.
- **Functions:** used by `record_paid_invoice_income`.
- **DDL/RLS/indexes:** `UNKNOWN`; absent from the repository baseline.
- **Modules:** invoice payment state and finance linkage.

## Products And Inventory

### `products`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** canonical Leonety products.
- **Primary key:** UUID `id`; unique `(company_id, id)`.
- **Important columns:** `company_id`, `name`, `sku`, `barcode`, category fields,
  description, purchase/selling prices, currency, stock, threshold, status,
  `image_url`, WooCommerce presentation fields.
- **Foreign keys:** workspace and optional `category_id`.
- **Indexes:** workspace/status; case-insensitive workspace SKU uniqueness; workspace
  barcode uniqueness.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** products, inventory, import/export, channel comparison.

### `product_categories`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** workspace-defined product categories.
- **Primary key:** UUID `id`.
- **Important columns:** `company_id`, `name`, `slug`, description and optional
  provider category identifiers.
- **Indexes:** unique case-insensitive category name within company.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** products and import/export.

### `stock_movements`

- **Evidence:** `CONFIRMED` with an unresolved type concern; production deployment
  `UNKNOWN`.
- **Purpose:** append-oriented inventory movement/audit data.
- **Primary key:** UUID `id`.
- **Important columns:** company/product, movement type/quantity/reason/reference,
  before/after quantities, costs, optional source/creator and linked expense.
- **Foreign keys:** workspace/product; `linked_expense_id` is declared bigint.
- **Indexes:** company/product chronology and linked expense.
- **RLS:** owner select policy; writes are intended through server/RPC logic.
- **Functions:** `record_stock_movement` locks the product row and updates stock.
- **Concern:** linked expense type conflicts with later UUID assumptions.

### `product_syncs` and `product_channel_preferences`

- **Evidence:** application schema is repository-defined; production confirmed
  missing `product_syncs.external_url` on 2026-10-20.
- **Purpose:** external listing mappings/sync state and per-product publication
  preferences.
- **Primary keys:** UUID.
- **Important columns:** company/product/provider or channel, external IDs, sync
  status/error, nullable provider-returned `external_url` (missing in production;
  `20261015100000.sql` is ready to apply), publish request, JSON overrides, timestamps.
- **Indexes:** unique workspace/product/channel or provider mapping.
- **RLS:** enabled; owner-select for syncs and owner select/insert/update for
  preferences.
- **Modules:** WooCommerce and channel comparison/publishing.
- **URL semantics:** an external link is stored only when returned by the provider
  and validated as HTTP(S). Historical rows remain without a URL unless a future
  provider refresh returns one; Leonety does not infer URLs from IDs or slugs.

### Product image storage

- **Evidence:** JPEG-only allowlist is declared in the consolidated migration;
  production bucket configuration is not verified.
- **Purpose:** product images in the `product-images` storage bucket.
- **Configuration:** public bucket with a 5 MB limit. The repository migration
  `20261028120000_product_image_formats.sql` additively permits JPEG, PNG and WebP
  so transparent product images can be retained. Production application is pending
  manual execution and verification.
- **Policies:** workspace-folder owner select/insert/update on `storage.objects`.
- **Concern:** bucket publicity and delete behavior should be verified against current
  product privacy requirements.

## Employees And Scheduling

### `employees`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** workspace employees, employment terms, compensation and private
  profile data.
- **Primary key:** UUID `id`; unique `(company_id, id)`.
- **Important columns:** name/contact/job/status plus profile, address, employment,
  compensation, leave, tax/social-insurance and country-specific fields.
- **Foreign keys:** `company_id` -> `companies.id`.
- **Indexes:** workspace/status, country/start date, and pending employee-number
  indexes.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** employees, shifts, scheduling.
- **Sensitivity:** tax IDs, social-insurance values, identity data and documents must
  not be exposed broadly or cached for offline use.

### `locations`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** workspace work locations.
- **Primary key:** UUID `id`; unique `(company_id, id)`.
- **Important columns:** name, address, city, country, notes, timestamps.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** employees and shifts.

### `shifts`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** actual dated employee shifts.
- **Primary key:** UUID `id`.
- **Important columns:** company, employee, optional location, date, start/end,
  break, status, notes.
- **Foreign keys:** company-scoped employee/location references.
- **Indexes:** company/employee/location by date; partial unique index prevents exact
  duplicate non-cancelled shifts.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** shifts and schedule printing.
- **Concurrency protection:** current repository DDL does not prevent general
  overlaps. Proposed migration
  `20261009120000.sql` is `PENDING`, not
  production-confirmed; it serializes writes by company/employee/date and retains
  cancelled-shift and exact-duplicate behavior.

### `employee_weekly_schedules` and `location_operating_hours`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** regular per-weekday employee schedules and non-authoritative location
  opening-hour suggestions.
- **Primary keys:** UUID rows scoped by company and weekday.
- **Important columns:** working/open flag, start/end, break and optional location.
- **Indexes/constraints:** uniqueness per employee/location weekday and company.
- **RLS:** enabled; workspace owner manages rows.
- **Modules:** schedule defaults and bulk shift creation.

### `employee_number_settings`

- **Evidence:** `PRODUCTION VERIFIED` for required settings columns, employee number,
  workspace-scoped uniqueness and relevant RLS policies. Migration history remains
  `UNKNOWN`; formatting-only SQL must be reviewed separately.
- **Purpose:** workspace policy and concurrency-safe counter for Personalnummer.
- **Primary key:** `company_id` -> `companies.id`.
- **Important columns:** requirement/automatic flags, prefix, next number, minimum
  digits, timestamps.
- **Related column/index:** nullable `employees.employee_number`, case-insensitive
  uniqueness per company.
- **RLS:** owner select/insert/update; direct authenticated grants are declared.
- **Functions/triggers:** initialize settings, prevent counter rollback, allocate a
  number while locking the settings row.
- **Production status:** schema components listed above are present (verified
  2026-10-20); application-history identity is unknown.

### Employee document tables

- **Tables:** `employee_document_requirements`, `employee_documents`,
  `employee_document_settings`.
- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** document requirements, private metadata and workspace settings.
- **Foreign keys:** company and employee relationships.
- **Indexes:** employee chronology and expiration-date lookup.
- **RLS:** enabled with workspace-owner policies in the consolidated file.
- **Modules:** employee documents.

## Contracts

### `contracts` and `contract_versions`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** canonical contracts and immutable document versions.
- **Primary keys:** UUID.
- **Important columns:** company/client/reference/template/language/title/status,
  dates, party/terms/document JSON snapshots, author and timestamps; versions store
  version number and document snapshot.
- **Foreign keys:** workspace, optional client, author, and contract/version scope.
- **Indexes:** company reference uniqueness, company status/update/client, version
  chronology.
- **RLS:** enabled with owner-scoped select/write policies.
- **Functions/triggers:** `set_contract_updated_at`.
- **Modules:** contracts and invoice creation linkage.

## Notifications

### `order_notification_devices`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** one Web Push subscription per browser/device installation.
- **Important columns:** company/user/device metadata, endpoint and push keys,
  enabled/status/last-used timestamps.
- **Indexes:** workspace/status; endpoint uniqueness is defined in the SQL.
- **RLS:** enabled; direct client policy/grants must be reviewed with API-only access
  expectations.
- **Modules:** notification settings and server push.

### `order_notification_settings`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** workspace order-notification preference, foreground sound enablement,
  volume and custom sound reference.
- **Primary key:** company-scoped settings row.
- **RLS:** enabled; owner-scoped access in the consolidated file.
- **Modules:** notification settings.

### `incoming_order_alert_events`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** durable deduplicated `order.created` event/alert record. This current
  integration path does not import full provider orders or line items into a separate
  canonical order-management table; it retains safe event metadata only.
- **Important columns:** company/provider/event/order identifiers, timestamps and
  safe notification metadata. The pending additive migration adds independent human
  acknowledgement (`new`, `notified`, `seen`, `acknowledged`), acknowledgement actor
  and bounded push-attempt/claim scheduling state.
- **Indexes:** workspace chronology, provider identity constraint, and pending
  escalation due-time partial index (pending migration).
- **RLS:** enabled; intended for authorized server processing.
- **Modules:** verified integration webhook, in-app alert, Web Push and the bounded
  escalation worker. A `sent` push status means the push service accepted a request,
  not that a person received or acknowledged it.
- **Production status:** all migration-defined shape remains `UNKNOWN` until checked
  in the live project; `20261012170000.sql`
  is `PENDING` and has not been executed.

## Integrations

### `woocommerce_connections`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** one WooCommerce connection per company.
- **Important columns:** store URL, consumer credentials, sync flag/status,
  timestamps.
- **RLS:** enabled without a client-readable policy; intended for authorized
  server-only access.
- **Modules:** WooCommerce.
- **Sensitivity:** credential storage/encryption must be verified in production.

### `store_integrations`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** generalized provider connection metadata.
- **Important columns:** company/provider/account/merchant identifiers, credential
  fields, status, sync/error metadata and timestamps.
- **Indexes:** workspace/provider uniqueness plus provider-specific lookups.
- **RLS:** enabled; owner select policy only in the current file.
- **Modules:** integration onboarding and provider status.
- **Concern:** provider enumeration does not establish real API support; secret
  encryption and write authorization require verification.

### `whatsapp_webhook_events`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** webhook replay protection per integration.
- **Primary key:** UUID; unique provider event per connection.
- **RLS:** enabled; owner select.
- **Modules:** WhatsApp integration.

### `whatsapp_business_numbers`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** WhatsApp number records referenced by application code.
- **DDL/RLS/indexes:** `UNKNOWN`; absent from current migration.

## Billing

### Billing tables

- **Tables:** `billing_customers`, `billing_subscriptions`, `billing_payments`,
  `billing_events`.
- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** external billing identity, plan state, payments, and webhook
  idempotency.
- **Primary keys:** UUID; provider identifiers are unique.
- **Foreign keys:** company, authenticated user, and billing customer.
- **Indexes:** company and provider event lookups.
- **RLS:** enabled. Owners may select customer/subscription/payment rows;
  `billing_events` has no client-readable policy.
- **Functions/triggers:** subscription changes update `app_access`.
- **Modules:** billing and entitlement enforcement.

## AI

- **Evidence:** `UNKNOWN`
- Current application table-reference scanning does not establish active
  `ai_chats`/`ai_messages` usage, while the historical audit reported AI chat tables
  in production.
- No AI table DDL exists in the current migration.
- Production tables, RLS and retention must be inspected before documenting chat
  persistence as confirmed.

## Administration

### `admin_accounts`

- **Evidence:** production RLS/grants/policy state verified 2026-10-20; migration
  history remains unknown.
- **Purpose:** allowlist for Leonety operator administrators.
- **Primary key:** `user_id` -> `auth.users.id`; unique email.
- **Production state:** RLS enabled; no effective `anon` or `authenticated` table
  privileges; `service_role` has access; a policy permits reading the caller's own
  admin row; no table trigger was found. The original consolidated SQL does not
  describe this complete production state.
- **Migration history:** `20261008221134.sql` is not marked applied; matching
  security state may have been applied manually or by another SQL source.
- **Application use:** server-side admin authorization queries this table.
- **Routine review:** repository `enforce_workspace_entitlement_limit()` is
  trigger-only with no caller-controlled arguments or writes to `admin_accounts`; its
  body uses qualified table names and revokes PUBLIC execute. Production
  `is_current_user_admin` is absent from repository sources and its definition/execute
  ACL was not included in supplied results, so complete routine sign-off remains open.

### `admin_audit_events`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** record operator entitlement/access changes.
- **Important columns:** actor/target/company/action and safe metadata/timestamps.
- **RLS:** enabled; policy design should remain server-only/default-deny.
- **Modules:** operator access administration.

### `user_activity`

- **Evidence:** `PENDING MIGRATION`; production `UNKNOWN`.
- **Purpose:** coarse last-use timestamp for the authenticated Leonety app; one row
  per account, not an event log.
- **Primary key / foreign key:** `user_id` UUID references `auth.users.id` with
  `ON DELETE CASCADE`; `last_activity_at` is the only activity value.
- **RLS/grants:** RLS enabled; no direct `public`, `anon`, or `authenticated`
  privileges. The server-only service role writes after session authentication; only
  the operator-authorized Admin Users API reads global activity values.
- **Function:** `record_leonety_user_activity(uuid)` atomically inserts or updates
  no more than once per five minutes per user.
- **Modules:** authenticated app heartbeat and operator Admin Users directory.
- **Privacy:** no routes, IP addresses, interaction details, or event history stored.

## Mailbox

### `mailbox_connections`

- **Evidence:** current application columns and multi-provider production model
  verified 2026-10-20; local migration history remains unknown.
- **Purpose:** server-only connected mailbox metadata for Google Gmail, Microsoft
  Graph, or TLS-only IMAP/SMTP. The provider remains the source of message content.
- **Primary key:** UUID `id`.
- **Important columns:** company/provider/account email; optional display name and
  provider account ID; encrypted OAuth access/refresh tokens or encrypted IMAP/SMTP
  configuration; expiry, granted scopes, status, history cursor,
  successful-connection time and safe error/timestamps.
- **Indexes:** unique provider account per company and company/status lookup.
- **RLS/grants:** owner policies are declared in the pending timestamped migration;
  all direct `anon` and `authenticated` table grants are revoked and only
  `service_role` receives table privileges. API handlers must authenticate and
  verify `companies.owner_id` before using the service client.
- **Functions/triggers:** normalize account email and set `updated_at`; the pending
  multi-provider extension adds service-role-only atomic connection-slot allocation
  and reactivation functions.
- **Production status:** current application columns and supported providers are
  present. Prior inspection also reported no effective `anon`/`authenticated` table
  privileges and service-role access; exact migration identity remains unknown.
- **Privacy:** no bodies, subjects, recipients, attachments or mailbox HTML are
  stored by this model.
- **Migration caution:** do not apply the obsolete Google-only
  `20261010130000.sql` or replay the multi-provider proposal blindly. Compare any
  future change to the verified live table first.

## Known Database Concerns

1. **Migration history:** remote migration history is still not correlated with the
   timestamp-only local SQL files. Confirmed production objects do not establish
   which migration file, if any, created them.
2. **Migration filenames:** current files are intended for manual SQL Editor use;
   Supabase CLI skips timestamp-only names without a descriptive suffix.
3. **Incomplete baseline:** core tables are assumed, not created; the repository
   cannot reproduce a fresh database safely.
4. **Active timers:** production has `active_timers.user_id` and its auth FK. The
   consolidated repository DDL still omits that column, so the baseline is internally
   inconsistent but production is not missing the field.
5. **Admin routines:** production `admin_accounts` RLS/effective grants are
   restrictive. The repository `enforce_workspace_entitlement_limit()` definition
   does not write admin rows and is trigger-only. Production `is_current_user_admin`
   definition/execute ACL was not supplied and is not present in repository sources;
   full routine sign-off remains open.
6. **Verified present:** Legal company fields, invoice currency/snapshot triggers,
   income/expense currency snapshots, employee number/settings/RLS, and the current
   multi-provider mailbox schema are present in production. Their migration-history
   identities remain unknown. Do not reapply old proposals blindly.
7. **WooCommerce blocker:** production lacks `product_syncs.external_url`.
   `supabase/migrations/20261015100000.sql` is the existing nullable additive repair,
   status `READY TO APPLY`; do not execute it without manual review.
8. **Shift overlap:** application checks can race, and
   `20261009120000.sql` proposes database-level protection. Its production state is
   not included in the supplied inspection.
9. **User activity / urgent-order schema:** production state and migration history
   were not covered by this inspection; retain their separate pending status.
10. **Historical financial/invoice data:** never backfill currency conversions or
    invent seller/buyer snapshots for old records. Existing persisted values remain
    authoritative.

## Functions And Triggers Represented In The Repository

The consolidated file defines or replaces these business functions:

- `enforce_active_timer_limit`
- `start_active_timer`, `pause_active_timer`, `resume_active_timer`,
  `stop_active_timer`
- `apply_billing_subscription_to_app_access`
- `set_contract_updated_at`
- `record_stock_movement`
- `enforce_invoice_contract_scope`
- `record_paid_invoice_income`
- `enforce_workspace_entitlement_limit`
- `initialize_employee_number_settings`
- `guard_employee_number_settings_counter`
- `prepare_employee_number`
- `prevent_employee_shift_overlap` (pending migration only; not confirmed in DB)
- `prevent_invoice_document_snapshot_change` (present in production; local migration
  history remains unknown)
- `set_mailbox_connection_updated_at`

Their corresponding triggers are declared in the same file. Production existence and
exact definitions remain `UNKNOWN` until read-only catalog verification.

## Future Database Workflow

Every future DB-changing feature should:

1. Audit the existing schema.
2. Create one timestamped migration if required.
3. Update `DATABASE_CHANGELOG.md`.
4. Update `DATABASE_SCHEMA.md` if architecture changed.
5. Receive manual migration review.
6. Be applied through an explicitly approved process.
7. Be verified after application.
8. Be marked `APPLIED` in `DATABASE_CHANGELOG.md` only after confirmation.

Do not use a permanently overwritten `UPD.sql`. Do not add migrations to
`.gitignore`.
