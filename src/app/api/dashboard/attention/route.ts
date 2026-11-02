import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildDashboardAttentionItems, type DashboardAttentionCounts, type DashboardAttentionType } from '@/lib/dashboard-attention'

export const runtime = 'nodejs'

const querySchema = z.object({ companyId: z.string().uuid() })
const pageSize = 1000
const maxProductRows = 20_000
type SourceResult = { count: number | null; status: 'ok' | 'unavailable' }

async function countSource(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<SourceResult> {
  const result = await query
  return result.error || result.count === null
    ? { count: null, status: 'unavailable' }
    : { count: result.count, status: 'ok' }
}

async function lowStockSource(admin: ReturnType<typeof createSupabaseAdminClient>, companyId: string): Promise<SourceResult> {
  const countResult = await admin.from('products').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'active')
  if (countResult.error || countResult.count === null || countResult.count > maxProductRows) return { count: null, status: 'unavailable' }

  let lowStockCount = 0
  for (let from = 0; from < countResult.count; from += pageSize) {
    const expectedRows = Math.min(pageSize, countResult.count - from)
    const { data, error } = await admin.from('products').select('current_stock, low_stock_threshold')
      .eq('company_id', companyId).eq('status', 'active')
      .order('id', { ascending: true }).range(from, from + expectedRows - 1)
    if (error || !data || data.length !== expectedRows) return { count: null, status: 'unavailable' }
    lowStockCount += data.filter((product) => {
      const stock = Number(product.current_stock)
      const threshold = Number(product.low_stock_threshold)
      return Number.isFinite(stock) && Number.isFinite(threshold) && stock <= threshold
    }).length
  }
  return { count: lowStockCount, status: 'ok' }
}

async function authorize(companyId: string) {
  const session = await createServerSupabaseClient()
  const { data, error } = await session.auth.getUser()
  if (error || !data.user) return { response: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }

  const admin = createSupabaseAdminClient()
  const { data: company, error: companyError } = await admin.from('companies').select('id')
    .eq('id', companyId).eq('owner_id', data.user.id).maybeSingle()
  if (companyError) return { response: NextResponse.json({ error: 'workspace_check_failed' }, { status: 503 }) }
  if (!company) return { response: NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 }) }
  return { admin }
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await authorize(parsed.data.companyId)
  if ('response' in access) return access.response

  const { admin } = access
  const companyId = parsed.data.companyId
  const today = new Date().toISOString().slice(0, 10)
  const checks: Array<[DashboardAttentionType, Promise<SourceResult>]> = [
    ['overdue_invoices', countSource(admin.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['sent', 'overdue']).lt('due_date', today))],
    ['low_stock_products', lowStockSource(admin, companyId)],
    ['woocommerce_sync_errors', countSource(admin.from('product_syncs').select('product_id', { count: 'exact', head: true }).eq('company_id', companyId).eq('channel', 'woocommerce').eq('sync_status', 'failed'))],
    ['mailbox_reconnect', countSource(admin.from('mailbox_connections').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['reconnect_required', 'error']))],
    ['integration_errors', countSource(admin.from('store_integrations').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'error'))],
  ]

  const results = await Promise.all(checks.map(async ([type, promise]) => {
    try { return [type, await promise] as const } catch { return [type, { count: null, status: 'unavailable' as const }] as const }
  }))
  const counts = Object.fromEntries(results.map(([type, result]) => [type, result.count ?? 0])) as DashboardAttentionCounts
  const hasUnavailable = results.some(([, result]) => result.status !== 'ok')

  return NextResponse.json({
    status: hasUnavailable ? 'partial' : 'ok',
    items: buildDashboardAttentionItems(counts),
    sources: Object.fromEntries(results.map(([type, result]) => [type, result.status])),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
