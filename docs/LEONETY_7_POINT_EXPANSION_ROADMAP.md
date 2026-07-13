# Leonety 7-Point Expansion Roadmap

This roadmap is intentionally incremental. Each step is isolated so existing auth, workspace, billing, invoices, products, timers, and Supabase flows can keep running during deployment.

## 1. Anti-Flicker Multilingual Middleware

Goal: move from client-only language switching to server-rendered locale routes while preserving the current selector.

Paths:
- `src/middleware.ts` or current `src/proxy.ts`
- `src/app/[locale]/(public)/...`
- `src/app/[locale]/app/...`
- `src/lib/i18n/server.ts`
- `src/lib/i18n/dictionaries/{en,de,tr,ru,ua,pl,fr}.ts`

Implementation notes:
- Supported locales: `en`, `de`, `tr`, `ru`, `ua`, `pl`, `fr`.
- Store preference in `leonety-locale` cookie.
- Fallback order: cookie -> `Accept-Language` -> `en`.
- Server Components must receive dictionary data before render.
- Client language switcher should update cookie and navigate to the same route under the new locale.

Middleware sketch:

```ts
import { NextResponse, type NextRequest } from 'next/server'

const locales = ['en', 'de', 'tr', 'ru', 'ua', 'pl', 'fr'] as const
const defaultLocale = 'en'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  const hasLocale = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`))
  if (hasLocale) return NextResponse.next()

  const cookieLocale = request.cookies.get('leonety-locale')?.value
  const locale = locales.includes(cookieLocale as any) ? cookieLocale : defaultLocale
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}
```

## 2. Multi-Workspace RLS

Goal: enforce tenant isolation in the database, not only in the UI.

Supabase SQL:

```sql
create or replace function public.get_workspaces_for_user()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select id
  from public.companies
  where owner_id = auth.uid();
$$;

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;

drop policy if exists "Owners can manage invoices" on public.invoices;
create policy "Owners can manage invoices"
on public.invoices
for all
using (company_id in (select public.get_workspaces_for_user()))
with check (company_id in (select public.get_workspaces_for_user()));

drop policy if exists "Owners can manage clients" on public.clients;
create policy "Owners can manage clients"
on public.clients
for all
using (company_id in (select public.get_workspaces_for_user()))
with check (company_id in (select public.get_workspaces_for_user()));
```

## 3. Asynchronous Full-Text Server Search

Goal: replace heavy client-side search with a server action backed by PostgreSQL full-text indexes.

Paths:
- `src/app/app/actions/search.ts`
- `src/components/app-shell/server-search-client.tsx`

SQL:

```sql
create index if not exists clients_search_idx
on public.clients
using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(interested_in,'')));

create index if not exists invoices_search_idx
on public.invoices
using gin (to_tsvector('simple', coalesce(invoice_number,'') || ' ' || coalesce(status,'')));
```

Server Action sketch:

```ts
'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function searchWorkspace(companyId: string, query: string) {
  const supabase = await createServerSupabaseClient()
  const normalized = query.trim()
  if (normalized.length < 2) return []

  const { data, error } = await supabase.rpc('global_workspace_search', {
    p_company_id: companyId,
    p_query: normalized,
  })
  if (error) throw error
  return data ?? []
}
```

## 4. Billing Handshake

Recommendation:
- Stripe if you want maximum control.
- Paddle if you want Merchant-of-Record VAT handling.
- Cryptomus only if crypto payments are a core requirement.

Paths:
- `src/app/api/webhooks/billing/route.ts`
- `src/lib/billing/provider.ts`
- `src/lib/billing/quotas.ts`

Env:

```env
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
CRYPTOMUS_MERCHANT_ID=
CRYPTOMUS_PAYMENT_KEY=
```

Webhook rule:
- Validate signature first.
- Map subscription to `app_access` or `billing_subscriptions`.
- Never trust client plan updates.

## 5. Progressive Real-Time Refresh

Goal: server renders full HTML first, then client attaches Supabase realtime updates.

Paths:
- `src/components/realtime/realtime-company-channel.tsx`
- `src/lib/realtime/revalidate-tags.ts`

Client sketch:

```ts
const channel = supabase.channel(`company:${companyId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `company_id=eq.${companyId}` }, () => {
    router.refresh()
  })
  .subscribe()
```

## 6. Secure Server-Side Time Tracking API

Goal: clients cannot spoof timer duration.

SQL RPC:

```sql
create or replace function public.complete_active_timer_secure(p_timer_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  timer_row public.active_timers%rowtype;
  created_entry public.time_entries%rowtype;
  seconds_elapsed integer;
begin
  select *
  into timer_row
  from public.active_timers
  where id = p_timer_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Timer not found';
  end if;

  seconds_elapsed := greatest(0, timer_row.accumulated_seconds + extract(epoch from (now() - timer_row.started_at))::integer);

  insert into public.time_entries (company_id, user_id, description, hours, date)
  values (timer_row.company_id, auth.uid(), timer_row.description, round((seconds_elapsed::numeric / 3600), 2), current_date)
  returning * into created_entry;

  delete from public.active_timers where id = p_timer_id;
  return created_entry;
end;
$$;
```

## 7. Multilingual PDF Generation

Goal: isolated invoice PDF endpoint.

Path:
- `src/app/api/invoices/[id]/pdf/route.ts`

Preferred implementation:
- Use server-side HTML -> PDF with a Node runtime renderer for reliability.
- Edge PDF rendering with full Cyrillic support is possible but more limited; choose an engine only after font tests.

Endpoint contract:

```ts
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Authenticate user
  // 2. Load invoice by id with company ownership check
  // 3. Render localized invoice HTML
  // 4. Stream PDF response
}
```

Font requirement:
- Noto Sans
- Noto Sans Cyrillic
- Noto Sans Symbols

