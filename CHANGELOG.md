# Changelog

Meaningful Leonety changes are recorded here. Small formatting-only refactors and test housekeeping are omitted.

## Unreleased

### Added

- Secure read-only Leonety operator user directory with server-side Supabase Admin pagination, search and registration consistency counts.
- Workspace Legal / Impressum settings with structured manual data and preview.
- Server-side Resend transactional email infrastructure for upgrade-request notifications.
- Cross-device Web Push subscription management, real server-delivered tests and order notification transport.
- Google-powered address autocomplete with manual address entry preserved.
- Canonical product improvements: SKU/category workflows, reviewed CSV import/export, photo-to-draft import and controlled channel comparison.
- Employee Personalnummer schema support, regular schedules, bulk shift planning and a separate A4 employee schedule print view.

### Changed

- OpenAI now runs behind a server-only provider adapter while preserving Assistant behavior.
- Assistant scope classification accepts imperfect multilingual Leonety product/inventory questions while rejecting unrelated prompts.
- Invoice single and batch print paths use one canonical Standard renderer without changing accounting calculations.
- Integration onboarding uses provider-specific states and does not present unsupported providers as connectable.
- Authenticated navigation, mobile layouts and page-state preservation were stabilized.

### Fixed

- Web Push configuration detection and subscription lifecycle handling across supported desktop, Android and installed iOS PWA contexts.
- Mobile overflow and narrow form layouts in authenticated settings/profile workflows.
- Product, finance and client list consistency regressions covered by the current tests.

### Security

- Added server-only authorization for the global Leonety user directory; workspace owners cannot enumerate Supabase Auth users unless they are separately Leonety administrators.
- Kept provider credentials, service-role access, VAPID private keys and integration tokens outside browser responses.
- Preserved workspace authorization for AI context, notifications and integrations.

### Database

- `supabase/migrations/leonety_consolidated_schema.sql` is non-timestamped and the previously observed linked history was empty; it must not be replayed against production automatically.
- New database work must use reviewed timestamped additive migrations and preserve traceable production history.
- Employee-number and mailbox schema work appears in repository SQL; verify live-catalog application status before relying on it during deployment.

### External configuration required

- Vercel environment variables from `.env.example` for enabled features.
- Supabase Auth providers and redirects.
- Paddle products, webhook and production configuration.
- Resend verified sending domain and provider-supplied DNS records.
- VAPID key pair and subject.
- OpenAI API key for the Assistant and product photo extraction.
- Google, Shopify and Meta application setup for enabled integrations.

### Pending / not implemented

- Lieferando / Takeaway remains **Partner setup required**; no production API connection is claimed.
- Connected Gmail/Google Workspace human mailbox UI and provider implementation are not present.
- Stripe variables are referenced by the billing abstraction, but checkout is currently Paddle-only.
