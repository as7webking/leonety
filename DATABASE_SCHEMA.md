# Leonety Database Schema

This document describes the current intended Leonety database architecture from
repository evidence. It is not executable SQL and does not replace
`supabase/migrations/`.

Evidence labels:

- `CONFIRMED`: directly defined by the current repository migration.
- `APPLICATION EXPECTATION`: referenced by current application code but not fully
  defined by the repository migration.
- `PENDING MIGRATION`: SQL exists in the non-runnable consolidated file, but
  production deployment is not independently verified.
- `UNKNOWN`: production shape or security state requires live catalog inspection.

These labels describe repository confidence, not production deployment. The current
repository cannot reproduce the full production database from scratch.

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

- **Evidence:** `APPLICATION EXPECTATION`
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
- **Indexes/RLS:** authoritative production definition is `UNKNOWN`.
- **Modules:** workspace selection/settings, nearly all workspace-owned data.
- **Concern:** the 15 legal columns are used by the application but absent from the
  repository migration.

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
- **Foreign keys:** expected links to `companies`, `clients`, and `invoices`.
- **Indexes:** workspace/client and workspace/invoice indexes are declared.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** income, expenses, transactions, dashboard, Kassenbuch.
- **Concern:** identifier types must be read from production before a repair.

### `time_entries`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** completed time tracking records.
- **Important columns:** timer RPC expects `user_id`, `company_id`, `description`,
  `hours`, `date`, `timer_started_at`, `timer_completed_at`.
- **DDL/RLS:** base definition is absent; production state `UNKNOWN`.
- **Modules:** time tracking.

### `active_timers`

- **Evidence:** `CONFIRMED` definition with a confirmed internal mismatch;
  production final shape `UNKNOWN`.
- **Purpose:** in-progress workspace timers.
- **Primary key:** UUID `id`.
- **Important columns created:** `company_id`, `description`, `started_at`,
  `created_at`; later SQL adds `paused_at`, `accumulated_seconds`,
  `original_started_at`.
- **Missing required column:** trigger logic and current application code use
  `user_id`, but current `CREATE TABLE` does not define it.
- **Indexes:** company and start-time indexes; the file drops an older user uniqueness
  constraint.
- **RLS:** enabled; owner-scoped policies through `companies.owner_id`.
- **Functions/triggers:** start, pause, resume, stop, timer-limit trigger.
- **Modules:** time tracking.

## Invoices

### `invoices`

- **Evidence:** `APPLICATION EXPECTATION`
- **Purpose:** canonical invoice records.
- **Primary key:** later guards expect UUID `id`.
- **Important columns:** application expects company/client identifiers, invoice
  number, status, dates, currency, canonical totals and payment state. Consolidated
  SQL adds `contract_id`.
- **Foreign keys:** expected links to `companies`, `clients`; optional contract link.
- **Indexes:** company/contract index declared.
- **RLS:** `UNKNOWN` because base DDL is absent.
- **Modules:** invoices, print/PDF rendering, contracts, finance.

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

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** external listing mappings/sync state and per-product publication
  preferences.
- **Primary keys:** UUID.
- **Important columns:** company/product/provider or channel, external IDs, sync
  status/error, publish request, JSON overrides, timestamps.
- **Indexes:** unique workspace/product/channel or provider mapping.
- **RLS:** enabled; owner-select for syncs and owner select/insert/update for
  preferences.
- **Modules:** WooCommerce and channel comparison/publishing.

### Product image storage

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** product images in the `product-images` storage bucket.
- **Configuration:** current SQL declares a public JPEG-only bucket with 5 MB limit.
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
  `20261009120000_prevent_overlapping_employee_shifts.sql` is `PENDING`, not
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

- **Evidence:** `PENDING`; corrected timestamped deployment SQL is
  `20261008233000_employee_numbers.sql`. Production presence remains `UNKNOWN`.
- **Purpose:** workspace policy and concurrency-safe counter for Personalnummer.
- **Primary key:** `company_id` -> `companies.id`.
- **Important columns:** requirement/automatic flags, prefix, next number, minimum
  digits, timestamps.
- **Related column/index:** nullable `employees.employee_number`, case-insensitive
  uniqueness per company.
- **RLS:** owner select/insert/update; direct authenticated grants are declared.
- **Functions/triggers:** initialize settings, prevent counter rollback, allocate a
  number while locking the settings row.
- **Production status:** `UNKNOWN`; live verification required.

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
- **Purpose:** workspace order-notification preference.
- **Primary key:** company-scoped settings row.
- **RLS:** enabled; owner-scoped access in the consolidated file.
- **Modules:** notification settings.

### `incoming_order_alert_events`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** deduplicate and audit normalized incoming-order alerts.
- **Important columns:** company/provider/event/order identifiers, timestamps and
  safe notification metadata.
- **Indexes:** workspace chronology and provider identity constraints.
- **RLS:** enabled; intended for authorized server processing.
- **Modules:** integration webhooks and Web Push.

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

- **Evidence:** `CONFIRMED` table definition; security hardening
  `PENDING MIGRATION`.
- **Purpose:** allowlist for Leonety operator administrators.
- **Primary key:** `user_id` -> `auth.users.id`; unique email.
- **Current migration gap:** the consolidated file creates the table but does not
  enable RLS, define policies, revoke grants, or constrain writes.
- **Pending repair:** `20261008221134_secure_admin_accounts.sql` enables RLS, revokes
  all direct privileges from `public`, `anon`, and `authenticated`, and grants only
  server-required select/insert/update/delete privileges to `service_role`.
- **Application use:** server-side admin authorization queries this table.
- **Risk:** the global user directory must remain blocked until the pending migration
  is manually applied and its RLS/grants are verified in production.

### `admin_audit_events`

- **Evidence:** `CONFIRMED`; production deployment `UNKNOWN`.
- **Purpose:** record operator entitlement/access changes.
- **Important columns:** actor/target/company/action and safe metadata/timestamps.
- **RLS:** enabled; policy design should remain server-only/default-deny.
- **Modules:** operator access administration.

## Mailbox

### `mailbox_connections`

- **Evidence:** `PENDING MIGRATION`
- **Purpose:** server-only Google mailbox OAuth connection metadata. Gmail remains
  the source of message content.
- **Primary key:** UUID `id`.
- **Important columns:** company/provider/account email, encrypted access/refresh
  tokens, expiry, scopes, status, history cursor and safe error/timestamps.
- **Indexes:** unique provider account per company and company/status lookup.
- **RLS/grants:** owner policies are declared, but all direct `anon` and
  `authenticated` table grants are revoked; server API access is intended.
- **Functions/triggers:** normalize account email and set `updated_at`.
- **Production status:** `UNKNOWN`; live verification required.
- **Privacy:** no bodies, subjects, recipients, attachments or mailbox HTML are
  stored by this model.

## Known Database Concerns

1. **Migration history:** linked migration history returned no versions. Repository
   SQL cannot currently be correlated with production deployment records.
2. **Consolidated filename:** `leonety_consolidated_schema.sql` has no timestamp and
   is skipped by the Supabase CLI.
3. **Incomplete baseline:** core tables are assumed, not created; the repository
   cannot reproduce a fresh database safely.
4. **Active timers:** current DDL omits `user_id`, but trigger/function/application
   logic uses it.
5. **Legal settings:** application expects 15 company legal columns absent from the
   migration.
6. **Admin authorization:** the original `admin_accounts` definition lacks explicit
   RLS/grants. A default-deny repair exists in
   `20261008221134_secure_admin_accounts.sql` but is not `APPLIED` until manually
   confirmed and verified.
7. **Personalnummer:** Edit 4 is the source design; the corrected timestamped
   migration `20261008233000_employee_numbers.sql` is pending and has not been run.
   It keeps the same schema and fixes `lpad` truncation. Production deployment is
   unknown; inspect the live catalog before applying. Do not apply both definitions.
8. **Shift overlap:** application checks can race, and single-shift insertion has no
   overlap check. `20261009120000_prevent_overlapping_employee_shifts.sql` proposes
   a database trigger; it is pending review and has not been applied.
9. **Mailbox:** SQL exists only inside the skipped consolidated file; production
   deployment is not proven by migration history.
10. **Identifier types:** historical bigint/UUID conflicts remain for finance records
   and `stock_movements.linked_expense_id`.
11. **Application/schema gaps:** `upgrade_requests`, `whatsapp_business_numbers`,
    the full core schema, and possible historical AI chat tables are not represented
    by the current migration.

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
