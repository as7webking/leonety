import { NextResponse } from 'next/server'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import {
  escapeGlobalSearchTerm,
  globalSearchHref,
  GLOBAL_SEARCH_LIMIT_PER_GROUP,
  normalizeGlobalSearchQuery,
  type GlobalSearchGroup,
} from '@/lib/global-search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SearchResult {
  id: string
  group: GlobalSearchGroup
  title: string
  detail: string
  href: string
}

function uniqueRows<T extends { id: string }>(rows: T[], limit: number) {
  return [...new Map(rows.map((row) => [row.id, row])).values()].slice(0, limit)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const companyId = params.get('companyId') ?? ''
  const query = normalizeGlobalSearchQuery(params.get('q'))
  if (!query) return NextResponse.json({ error: 'invalid_query' }, { status: 400 })

  const auth = await requireOwnedCompany(companyId)
  if ('error' in auth) return auth.error
  if (!companyId) return NextResponse.json({ error: 'invalid_workspace' }, { status: 400 })

  const term = `%${escapeGlobalSearchTerm(query)}%`
  const limit = GLOBAL_SEARCH_LIMIT_PER_GROUP
  const db = auth.adminSupabase

  const [clientNames, clientCompanies, invoiceRows, productNames, productSkus, employeeNames, contractTitles, contractReferences] = await Promise.all([
    db.from('clients').select('id, name, client_company').eq('company_id', companyId).ilike('name', term).limit(limit),
    db.from('clients').select('id, name, client_company').eq('company_id', companyId).ilike('client_company', term).limit(limit),
    db.from('invoices').select('id, invoice_number, status').eq('company_id', companyId).ilike('invoice_number', term).limit(limit),
    db.from('products').select('id, name, sku').eq('company_id', companyId).ilike('name', term).limit(limit),
    db.from('products').select('id, name, sku').eq('company_id', companyId).ilike('sku', term).limit(limit),
    db.from('employees').select('id, name, job_title').eq('company_id', companyId).ilike('name', term).limit(limit),
    db.from('contracts').select('id, reference, title').eq('company_id', companyId).neq('status', 'archived').ilike('title', term).limit(limit),
    db.from('contracts').select('id, reference, title').eq('company_id', companyId).neq('status', 'archived').ilike('reference', term).limit(limit),
  ])

  if ([clientNames, clientCompanies, invoiceRows, productNames, productSkus, employeeNames, contractTitles, contractReferences].some((result) => result.error)) {
    return NextResponse.json({ error: 'search_unavailable' }, { status: 503 })
  }

  const clients = uniqueRows([...(clientNames.data ?? []), ...(clientCompanies.data ?? [])], limit)
  const products = uniqueRows([...(productNames.data ?? []), ...(productSkus.data ?? [])], limit)
  const contracts = uniqueRows([...(contractTitles.data ?? []), ...(contractReferences.data ?? [])], limit)

  const results: SearchResult[] = [
    ...clients.map((row) => ({ id: row.id, group: 'clients' as const, title: row.name, detail: row.client_company ?? '', href: globalSearchHref('clients', row.id) })),
    ...(invoiceRows.data ?? []).map((row) => ({ id: row.id, group: 'invoices' as const, title: row.invoice_number, detail: row.status, href: globalSearchHref('invoices', row.id) })),
    ...products.map((row) => ({ id: row.id, group: 'products' as const, title: row.name, detail: row.sku ?? '', href: globalSearchHref('products', row.id) })),
    ...(employeeNames.data ?? []).map((row) => ({ id: row.id, group: 'employees' as const, title: row.name, detail: row.job_title, href: globalSearchHref('employees', row.id) })),
    ...contracts.map((row) => ({ id: row.id, group: 'contracts' as const, title: row.title, detail: row.reference, href: globalSearchHref('contracts', row.id) })),
  ]

  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } })
}
