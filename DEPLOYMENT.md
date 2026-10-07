# Leonety deployment

This is the canonical deployment checklist for Leonety. It does not replace provider dashboards or a reviewed database change plan.

## Prerequisites

- Node.js 20.9 or newer and npm.
- A Vercel project connected to this repository.
- A Supabase project with Auth, Database and Storage configured.
- Provider accounts only for features enabled in the target environment.
- A reviewed backup and rollback plan before any production database change.

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` with development credentials. Never commit it.

## Database migrations

`supabase/migrations/` is version-controlled and must not be added to `.gitignore`. New changes use timestamped files such as:

```text
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
```

Production procedure:

1. Back up the database and inspect linked migration history.
2. Run `npx supabase migration list --linked` as a read-only history check.
3. Compare the proposed migration with the live schema and test it outside production.
4. Apply only a reviewed, additive migration through the approved release process.
5. Validate RLS, grants, foreign keys, functions and application compatibility.

Never use `supabase db reset` against production. Do not blindly run migration repair, replace migration history or replay a consolidated schema over a functioning database.

### Current repository caveat

`supabase/migrations/leonety_consolidated_schema.sql` has no standard timestamp and does not provide trustworthy production migration history by itself. The linked history has previously appeared empty while production contained application tables. Do not rename, execute, delete or reconcile that file during a normal deployment. Resolve migration history separately using production catalog evidence and a reviewed repair plan.

Do not create a permanently overwritten `UPD.sql`. Preserve every future database change as a new timestamped migration.

## Vercel environment configuration

Use `.env.example` as the variable-name inventory. Configure values separately for Production and, when required, Preview/Development. Server secrets must never use `NEXT_PUBLIC_*`.

The base application requires:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for approved server-only admin operations

Configure an optional feature group only when all variables in its `.env.example` section are available. Redeploy after changing Vercel environment variables.

## Supabase configuration

1. Set the production Site URL to `NEXT_PUBLIC_SITE_URL`.
2. Add `https://<app-domain>/auth/callback` and approved preview variants to Auth redirect URLs.
3. Enable Google/Facebook Auth only after configuring them in the Supabase dashboard.
4. Verify intended RLS policies before exposing public tables.
5. Keep the service-role key only in server runtime configuration.
6. Keep private business Storage buckets private unless a reviewed feature requires otherwise.

Supabase Auth remains responsible for signup verification, password reset and authentication email delivery.

## OAuth and callbacks

All callbacks use the origin in `NEXT_PUBLIC_SITE_URL`.

### Google Contacts

- Variables: `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`.
- Callback: `https://<app-domain>/api/clients/google-contacts/callback`.
- Enable Google People API and configure the OAuth consent screen.
- This authorization is separate from Google sign-in.

### Shopify

- Variables: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, optionally `SHOPIFY_API_VERSION`.
- Callback: `https://<app-domain>/api/store-integrations/oauth/callback?provider=shopify`.

### Google Merchant

- Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Callback: `https://<app-domain>/api/store-integrations/oauth/callback?provider=google_merchant`.
- Configure the approved Merchant APIs and OAuth consent screen.

### Meta / WhatsApp Business

- Configure the Meta app, Embedded Signup and webhook subscription.
- Webhook: `https://<app-domain>/api/webhooks/whatsapp`.
- Keep `META_APP_SECRET` and verification tokens server-only.

## Billing

The current checkout path is Paddle. Configure `BILLING_PROVIDER=paddle`, `PADDLE_ENVIRONMENT`, the API/webhook secrets and the three plan price IDs.

Paddle webhook URL:

```text
https://<app-domain>/api/billing/webhook
```

Use sandbox credentials in non-production environments. Stripe variables are referenced by the abstraction, but the checkout route rejects non-Paddle checkout. Do not select Stripe until that flow is implemented and reviewed.

## Transactional email

Leonety application email uses the server-side Resend adapter. Supabase Auth and Paddle keep their existing email responsibilities.

1. Verify the sending domain in Resend.
2. Add only provider-supplied SPF, DKIM and verification DNS records.
3. Configure `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, and optional `EMAIL_REPLY_TO`/`EMAIL_PRODUCT_NAME`.
4. Configure `UPGRADE_REQUEST_ADMIN_EMAIL` for upgrade-request notifications.

The support inbox is separate from transactional email. A connected Gmail/Google Workspace human mailbox UI is not implemented.

## Web Push

Generate one VAPID key pair and configure:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` as a valid `mailto:` address or HTTPS origin

Keep the private key server-only. Test the real server-to-push-service-to-service-worker path. On iOS, Web Push requires a supported installed Home Screen web app context.

## AI

Only the OpenAI adapter is registered:

- `AI_PROVIDER=openai`
- `AI_MODEL` (defaults to `gpt-5-mini`)
- either `AI_API_KEY` or the `OPENAI_API_KEY` fallback

All keys are server-only. Changing `AI_PROVIDER` does not enable an unimplemented adapter.

## Other integrations

- Address autocomplete defaults to Nominatim. For Google Places API New, set `ADDRESS_PROVIDER=google_maps` and a restricted server-side `GOOGLE_MAPS_API_KEY`.
- `LEONETY_CREDENTIAL_ENCRYPTION_KEY` protects saved workspace credentials and must remain stable across deployments.
- WooCommerce credentials are entered per workspace and stored encrypted, not in global environment variables.
- WooCommerce order webhook URLs and secrets are generated in authenticated integration settings.
- Lieferando / Takeaway remains **Partner setup required**. No active credential variables or production connection flow exists.

## Build verification

```bash
npm ci
npx tsc --noEmit
npm test
npm run lint
npm run build
```

Record every failure; do not hide existing lint or test failures.

## Post-deployment smoke test

1. Open the public site, sign in and verify production callback URLs.
2. Test email verification and password reset.
3. Open Dashboard and switch only between authorized workspaces.
4. Confirm normal users cannot access `/app/admin/users` or `/api/admin/users`.
5. Check representative finance, clients, invoices, products, employees and settings pages.
6. Test AI, email, address autocomplete, billing and Web Push only when configured.
7. Confirm service-worker navigation has no stale authenticated HTML or fetch loop.
8. Print existing Kassenbuch and invoice samples without changing their data.
9. Inspect Vercel/Supabase logs for safe error categories without secrets.

## Rollback

- Roll back application code through the normal Vercel/Git release mechanism.
- Never roll back production by resetting the database.
- Review database rollback separately and preserve user data; prefer an additive forward repair.
- Preserve the previous credential-encryption key and provider configuration during code rollback.
- Disable a provider feature without deleting stored workspace data when possible.
