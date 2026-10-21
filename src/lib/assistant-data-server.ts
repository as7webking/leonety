import 'server-only'

import type { createServerSupabaseClient } from '@/lib/supabase-server'
import { isSupportedCurrency } from '@/lib/currency'
import { getAssistantPeriodRange, type AssistantPeriod, type AssistantToolName } from '@/lib/assistant-context'
import { resolveAccountAccessForUser } from '@/lib/account-access-server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { buildAssistantPageRanges, buildAssistantUnpaidInvoices, summarizeTransactionAmounts, type AssistantInvoicePaymentRow, type AssistantInvoiceRow, type AssistantTransactionAmountRow } from '@/lib/assistant-data-math'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type TransactionTable = 'incomes' | 'expenses'
type PageResult<T> = { data: T[] | null; error: { code?: string } | null; count?: number | null }
const PAGE_SIZE = 400
const MAX_ROWS = 100_000

interface WorkspaceRow { id: string; name: string; currency: string | null; type: string }
interface ProductStockRow { name: string; sku: string | null; current_stock: number | string; low_stock_threshold: number | string }

export class AssistantWorkspaceAccessError extends Error {
  constructor(public readonly code: 'workspace_access_denied' | 'workspace_check_failed') { super(code) }
}

export class AssistantDataRetrievalError extends Error {
  constructor() { super('assistant_data_unavailable') }
}

function clean(value: string | null, maxLength = 160) {
  return value?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength) || null
}

async function readCompleteRows<T>(count: number | null, getPage: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  let ranges: Array<{ from: number; to: number }>
  try {
    ranges = buildAssistantPageRanges(count ?? -1, PAGE_SIZE, MAX_ROWS)
  } catch {
    throw new AssistantDataRetrievalError()
  }
  const rows: T[] = []
  for (let start = 0; start < ranges.length; start += 4) {
    const pages = await Promise.all(ranges.slice(start, start + 4).map(({ from, to }) => getPage(from, to)))
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      const range = ranges[start + index]
      if (page.error || (page.data?.length ?? 0) !== range.to - range.from + 1) throw new AssistantDataRetrievalError()
      rows.push(...(page.data ?? []))
    }
  }
  return rows
}

async function authorizeWorkspace(supabase: ServerSupabaseClient, userId: string, companyId: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, currency, type')
    .eq('id', companyId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (error) throw new AssistantWorkspaceAccessError('workspace_check_failed')
  if (!data) throw new AssistantWorkspaceAccessError('workspace_access_denied')
  return data as WorkspaceRow
}

function unavailable(tool: AssistantToolName, reason = 'query_failed') {
  return { tool, status: 'unavailable' as const, reason }
}

async function loadTransactionSummary(supabase: ServerSupabaseClient, table: TransactionTable, companyId: string, from: string, to: string, currency: string) {
  const countResult = await supabase.from(table).select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).gte('date', from).lte('date', to)
  if (countResult.error || countResult.count === null) throw new AssistantDataRetrievalError()
  const rows = await readCompleteRows<AssistantTransactionAmountRow>(countResult.count, (start, end) => supabase.from(table)
    .select('amount, currency, workspace_amount, workspace_currency')
    .eq('company_id', companyId).gte('date', from).lte('date', to).order('date', { ascending: true }).order('id', { ascending: true }).range(start, end))
  return summarizeTransactionAmounts(rows, currency)
}

async function loadProductCount(supabase: ServerSupabaseClient, companyId: string) {
  const result = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
  if (result.error || result.count === null) throw new AssistantDataRetrievalError()
  return result.count
}

async function loadLowStockProducts(supabase: ServerSupabaseClient, companyId: string) {
  const countResult = await supabase.from('products').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'active')
  if (countResult.error || countResult.count === null) throw new AssistantDataRetrievalError()
  const rows = await readCompleteRows<ProductStockRow>(countResult.count, (from, to) => supabase.from('products')
    .select('name, sku, current_stock, low_stock_threshold').eq('company_id', companyId).eq('status', 'active')
    .order('id', { ascending: true }).range(from, to))
  const products = rows.filter((product) => Number(product.current_stock) <= Number(product.low_stock_threshold))
  return {
    count: products.length,
    products: products.slice(0, 20).map((product) => ({
      name: clean(product.name), sku: clean(product.sku, 80),
      currentStock: String(product.current_stock), lowStockThreshold: String(product.low_stock_threshold),
    })),
  }
}

async function loadUnpaidInvoices(supabase: ServerSupabaseClient, companyId: string) {
  const countResult = await supabase.from('invoices').select('id', { count: 'exact', head: true })
    .eq('company_id', companyId).in('status', ['sent', 'overdue'])
  if (countResult.error || countResult.count === null) throw new AssistantDataRetrievalError()
  const invoices = await readCompleteRows<AssistantInvoiceRow>(countResult.count, (from, to) => supabase.from('invoices')
    .select('id, invoice_number, client_id, status, total, currency').eq('company_id', companyId)
    .in('status', ['sent', 'overdue']).order('id', { ascending: true }).range(from, to))
  if (invoices.length === 0) return { count: 0, invoices: [] }

  const payments: AssistantInvoicePaymentRow[] = []
  for (let offset = 0; offset < invoices.length; offset += 100) {
    const batch = invoices.slice(offset, offset + 100)
    const ids = batch.map((invoice) => invoice.id)
    const paymentCount = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).in('invoice_id', ids)
    if (paymentCount.error || paymentCount.count === null) throw new AssistantDataRetrievalError()
    const batchPayments = await readCompleteRows<AssistantInvoicePaymentRow>(paymentCount.count, (from, to) => supabase.from('invoice_payments')
      .select('invoice_id, amount, currency').eq('company_id', companyId).in('invoice_id', ids)
      .order('invoice_id', { ascending: true }).order('id', { ascending: true }).range(from, to))
    payments.push(...batchPayments)
  }

  const unpaid = buildAssistantUnpaidInvoices(invoices, payments)
  if (!unpaid) throw new AssistantDataRetrievalError()

  const clientIds = [...new Set(unpaid.invoices.map((invoice) => invoice.clientId).filter((id): id is string => Boolean(id)))]
  const customerById = new Map<string, string>()
  for (let offset = 0; offset < clientIds.length; offset += 100) {
    const ids = clientIds.slice(offset, offset + 100)
    const result = await supabase.from('clients').select('id, name').eq('company_id', companyId).in('id', ids)
    if (result.error) throw new AssistantDataRetrievalError()
    for (const client of result.data ?? []) customerById.set(client.id, clean(client.name) ?? '')
  }

  return {
    count: unpaid.count,
    invoices: unpaid.invoices.map(({ clientId, ...invoice }) => ({
      ...invoice,
      invoiceNumber: clean(invoice.invoiceNumber, 80),
      customer: clientId ? customerById.get(clientId) ?? '' : '',
    })),
  }
}

async function loadWooCommerceStatus(supabase: ServerSupabaseClient, companyId: string) {
  const current = await supabase.from('store_integrations').select('status')
    .eq('company_id', companyId).eq('provider', 'woocommerce').maybeSingle()
  if (!current.error && current.data) return { status: current.data.status }
  if (current.error && !['42P01', 'PGRST205'].includes(current.error.code ?? '')) throw new AssistantDataRetrievalError()

  const admin = createSupabaseAdminClient()
  const legacy = await admin.from('woocommerce_connections').select('active')
    .eq('company_id', companyId).maybeSingle()
  if (legacy.error && !['42P01', 'PGRST205'].includes(legacy.error.code ?? '')) throw new AssistantDataRetrievalError()
  if (legacy.error && current.error) throw new AssistantDataRetrievalError()
  return { status: legacy.data?.active ? 'connected' : 'not_connected' }
}

async function loadAccountPlan(userId: string, email: string | null | undefined, companyId: string) {
  const access = await resolveAccountAccessForUser(userId, email, { readOnly: true })
  if (!access.companyIds.includes(companyId)) throw new AssistantDataRetrievalError()
  return { plan: access.accountAccess.plan, isAdmin: access.accountAccess.isAdmin }
}

export async function loadAuthorizedAssistantData({
  supabase, userId, userEmail, companyId, tools, period, timeZone, now = new Date(),
}: {
  supabase: ServerSupabaseClient
  userId: string
  userEmail?: string | null
  companyId: string | null | undefined
  tools: AssistantToolName[]
  period: AssistantPeriod
  timeZone?: string
  now?: Date
}) {
  if (tools.length === 0) return []
  if (!companyId) return tools.map((tool) => unavailable(tool, 'no_workspace_selected'))

  const workspace = await authorizeWorkspace(supabase, userId, companyId)
  const currency = workspace.currency?.trim().toUpperCase() ?? ''
  const range = getAssistantPeriodRange(period, now, timeZone)

  return Promise.all(tools.map(async (tool) => {
    try {
      if (tool === 'current_workspace') {
        return { tool, status: 'ok' as const, data: { name: clean(workspace.name), currency, type: workspace.type } }
      }
      if (tool === 'account_plan') {
        const data = await loadAccountPlan(userId, userEmail, workspace.id)
        return { tool, status: 'ok' as const, data }
      }
      if (tool === 'woocommerce_status') {
        const data = await loadWooCommerceStatus(supabase, workspace.id)
        return { tool, status: 'ok' as const, data }
      }
      if (tool === 'product_count') {
        const count = await loadProductCount(supabase, workspace.id)
        return { tool, status: 'ok' as const, data: { count } }
      }
      if (tool === 'income_summary' || tool === 'expense_summary') {
        if (!isSupportedCurrency(currency)) throw new AssistantDataRetrievalError()
        const table: TransactionTable = tool === 'income_summary' ? 'incomes' : 'expenses'
        const data = await loadTransactionSummary(supabase, table, workspace.id, range.from, range.to, currency)
        return { tool, status: 'ok' as const, period: range, data: { ...data, period: range } }
      }
      if (tool === 'unpaid_invoice_summary') {
        return { tool, status: 'ok' as const, data: await loadUnpaidInvoices(supabase, workspace.id) }
      }
      if (tool === 'low_stock_products') {
        return { tool, status: 'ok' as const, data: await loadLowStockProducts(supabase, workspace.id) }
      }
      return unavailable(tool, 'unsupported_capability')
    } catch {
      return unavailable(tool)
    }
}))
}
