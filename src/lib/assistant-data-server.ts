import 'server-only'

import type { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSavedAmountInWorkspaceCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { getAssistantPeriodRange, type AssistantPeriod, type AssistantToolName } from '@/lib/assistant-context'

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

interface WorkspaceRow {
  id: string
  name: string
  currency: string | null
  type: string
}

interface TransactionAmountRow {
  amount: number | string
  currency: string
  exchange_rate?: number | string | null
  workspace_currency?: string | null
}

interface InvoiceSummaryRow {
  status: string
  total: number | string
  currency: string
}

interface ProductStockRow {
  name: string
  sku: string | null
  current_stock: number | string
  low_stock_threshold: number | string
}

export class AssistantWorkspaceAccessError extends Error {
  constructor(public readonly code: 'workspace_access_denied' | 'workspace_check_failed') {
    super(code)
  }
}

export function summarizeTransactionAmounts(rows: TransactionAmountRow[], workspaceCurrency: string) {
  const currency = normalizeCurrencyCode(workspaceCurrency)
  const amount = rows.reduce((total, row) => total + getSavedAmountInWorkspaceCurrency({
    amount: Number(row.amount) || 0,
    transactionCurrency: row.currency,
    workspaceCurrency: normalizeCurrencyCode(row.workspace_currency ?? currency),
    savedExchangeRate: row.exchange_rate === null || row.exchange_rate === undefined
      ? null
      : Number(row.exchange_rate),
  }), 0)

  return {
    count: rows.length,
    amount: Number(amount.toFixed(2)),
    currency,
  }
}

export function summarizeInvoices(rows: InvoiceSummaryRow[]) {
  const totalsByCurrency: Record<string, number> = {}
  const statusCounts: Record<string, number> = {}

  for (const row of rows) {
    const currency = normalizeCurrencyCode(row.currency)
    totalsByCurrency[currency] = Number(((totalsByCurrency[currency] ?? 0) + (Number(row.total) || 0)).toFixed(2))
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  }

  return { count: rows.length, statusCounts, totalsByCurrency }
}

function sanitizeBusinessText(value: string | null, maxLength = 160) {
  return value?.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength) || null
}

async function authorizeWorkspace(
  supabase: ServerSupabaseClient,
  userId: string,
  companyId: string
) {
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

function unavailable(tool: AssistantToolName, reason: string) {
  return { tool, status: 'unavailable' as const, reason }
}

export async function loadAuthorizedAssistantData({
  supabase,
  userId,
  companyId,
  tools,
  period,
  timeZone,
  now = new Date(),
}: {
  supabase: ServerSupabaseClient
  userId: string
  companyId: string | null | undefined
  tools: AssistantToolName[]
  period: AssistantPeriod
  timeZone?: string
  now?: Date
}) {
  if (tools.length === 0) return []
  if (!companyId) return tools.map((tool) => unavailable(tool, 'no_workspace_selected'))

  const workspace = await authorizeWorkspace(supabase, userId, companyId)
  const currency = normalizeCurrencyCode(workspace.currency)
  const range = getAssistantPeriodRange(period, now, timeZone)

  return Promise.all(tools.map(async (tool) => {
    if (tool === 'current_workspace') {
      return {
        tool,
        status: 'ok' as const,
        data: {
          name: sanitizeBusinessText(workspace.name),
          currency,
          type: workspace.type,
        },
      }
    }

    if (tool === 'income_summary' || tool === 'expense_summary') {
      const table = tool === 'income_summary' ? 'incomes' : 'expenses'
      const { data, error } = await supabase
        .from(table)
        .select('amount, currency, exchange_rate, workspace_currency')
        .eq('company_id', workspace.id)
        .gte('date', range.from)
        .lte('date', range.to)

      if (error) return unavailable(tool, 'query_failed')
      return {
        tool,
        status: 'ok' as const,
        period: range,
        data: summarizeTransactionAmounts((data ?? []) as TransactionAmountRow[], currency),
      }
    }

    if (tool === 'unpaid_invoice_summary') {
      const { data, error } = await supabase
        .from('invoices')
        .select('status, total, currency')
        .eq('company_id', workspace.id)
        .in('status', ['draft', 'sent', 'overdue'])

      if (error) return unavailable(tool, 'query_failed')
      return {
        tool,
        status: 'ok' as const,
        data: summarizeInvoices((data ?? []) as InvoiceSummaryRow[]),
      }
    }

    const { data, error } = await supabase
      .from('products')
      .select('name, sku, current_stock, low_stock_threshold')
      .eq('company_id', workspace.id)
      .eq('status', 'active')
      .order('current_stock', { ascending: true })
      .limit(100)

    if (error) return unavailable(tool, 'query_failed')
    const lowStock = ((data ?? []) as ProductStockRow[])
      .filter((product) => Number(product.current_stock) <= Number(product.low_stock_threshold))
      .slice(0, 20)
      .map((product) => ({
        name: sanitizeBusinessText(product.name),
        sku: sanitizeBusinessText(product.sku, 80),
        currentStock: Number(product.current_stock),
        lowStockThreshold: Number(product.low_stock_threshold),
      }))

    return {
      tool,
      status: 'ok' as const,
      data: {
        products: lowStock,
        limitedTo: 20,
        sourceRowsLimitedTo: 100,
      },
    }
  }))
}
