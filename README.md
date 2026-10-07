# Leonety

Leonety is a Next.js 16 business workspace application covering CRM, finance, invoices, products, inventory, employees, schedules, integrations, notifications and assisted workflows.

## Development

Install dependencies and create a local environment file:

```bash
npm ci
cp .env.example .env.local
```

Fill only the credentials needed for the features being tested. Never commit `.env.local` or server secrets.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build
```

## Operations

- Environment variable names and safe placeholders: [`.env.example`](./.env.example)
- Deployment, provider and migration checklist: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Product change history: [`CHANGELOG.md`](./CHANGELOG.md)

Database migrations in `supabase/migrations/` are version-controlled. Never reset production, overwrite migration history or add SQL migrations to `.gitignore`.

The public marketing application and authenticated app share this repository. Operational changes must preserve workspace authorization, Supabase RLS and server-only credential boundaries.
