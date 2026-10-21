// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isSupportedCurrency, normalizeCurrencyCode } from './currency.ts'

export function toAssistantMinorUnits(value: number | string, currency: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim())
  if (!match) return null
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const fraction = match[3] ?? ''
  let coefficient = BigInt(`${match[2]}${fraction.slice(0, digits).padEnd(digits, '0')}` || '0')
  if (fraction.length > digits && Number(fraction[digits]) >= 5) coefficient += BigInt(1)
  return match[1] ? -coefficient : coefficient
}

function fromMinorUnits(value: bigint, currency: string) {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const negative = value < BigInt(0)
  const absolute = negative ? -value : value
  if (digits === 0) return `${negative ? '-' : ''}${absolute}`
  const base = BigInt(10) ** BigInt(digits)
  return `${negative ? '-' : ''}${absolute / base}.${String(absolute % base).padStart(digits, '0')}`
}

export function formatAssistantMinorUnits(value: bigint, currency: string) {
  return fromMinorUnits(value, currency)
}

export interface AssistantTransactionAmountRow {
  amount: number | string
  currency: string
  workspace_amount?: number | string | null
  workspace_currency?: string | null
}

export function summarizeTransactionAmounts(rows: AssistantTransactionAmountRow[], workspaceCurrency: string) {
  const currency = normalizeCurrencyCode(workspaceCurrency)
  let total = BigInt(0)
  let unconvertedCount = 0
  for (const row of rows) {
    const transactionCurrency = row.currency?.trim().toUpperCase()
    const snapshotCurrency = row.workspace_currency?.trim().toUpperCase()
    const amount = !transactionCurrency || !isSupportedCurrency(transactionCurrency)
      ? null
      : transactionCurrency === currency
        ? String(row.amount)
        : snapshotCurrency === currency && row.workspace_amount !== null && row.workspace_amount !== undefined
          ? String(row.workspace_amount)
          : null
    const minor = amount === null ? null : toAssistantMinorUnits(amount, currency)
    if (minor === null) unconvertedCount += 1
    else total += minor
  }
  return {
    count: rows.length,
    amount: unconvertedCount === 0 ? fromMinorUnits(total, currency) : null,
    complete: unconvertedCount === 0,
    unconvertedCount,
    currency,
  }
}

export function isIssuedUnpaidInvoiceStatus(status: string) {
  return status === 'sent' || status === 'overdue'
}

export function calculateInvoiceOutstanding(total: number | string, paid: number | string, currency: string) {
  if (!isSupportedCurrency(currency)) return null
  const totalMinor = toAssistantMinorUnits(total, currency)
  const paidMinor = toAssistantMinorUnits(paid, currency)
  if (totalMinor === null || paidMinor === null) return null
  const outstanding = totalMinor - paidMinor
  return outstanding > BigInt(0) ? fromMinorUnits(outstanding, currency) : '0'
}

export interface AssistantInvoiceRow {
  id: string
  invoice_number: string | null
  client_id: string | null
  status: string
  total: number | string
  currency: string
}

export interface AssistantInvoicePaymentRow {
  invoice_id: string
  amount: number | string
  currency: string
}

export function buildAssistantUnpaidInvoices(invoices: AssistantInvoiceRow[], payments: AssistantInvoicePaymentRow[]) {
  const openInvoices = invoices.filter((invoice) => isIssuedUnpaidInvoiceStatus(invoice.status))
  const invoiceCurrencies = new Map<string, string>()
  for (const invoice of openInvoices) {
    const currency = invoice.currency.trim().toUpperCase()
    if (!isSupportedCurrency(currency)) return null
    invoiceCurrencies.set(invoice.id, currency)
  }

  const paidByInvoice = new Map<string, bigint>()
  for (const payment of payments) {
    const currency = invoiceCurrencies.get(payment.invoice_id)
    if (!currency || payment.currency.trim().toUpperCase() !== currency) return null
    const amount = toAssistantMinorUnits(payment.amount, currency)
    if (amount === null) return null
    paidByInvoice.set(payment.invoice_id, (paidByInvoice.get(payment.invoice_id) ?? BigInt(0)) + amount)
  }

  const result = openInvoices.flatMap((invoice) => {
    const currency = invoiceCurrencies.get(invoice.id)!
    const outstanding = calculateInvoiceOutstanding(
      invoice.total,
      formatAssistantMinorUnits(paidByInvoice.get(invoice.id) ?? BigInt(0), currency),
      currency
    )
    if (outstanding === null) return null
    if (outstanding === '0') return []
    return [{
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.client_id,
      status: invoice.status,
      currency,
      outstanding,
    }]
  })
  if (result.some((row) => row === null)) return null
  const rows = result as NonNullable<typeof result[number]>[]
  rows.sort((left, right) => left.status.localeCompare(right.status) || (left.invoiceNumber ?? left.id).localeCompare(right.invoiceNumber ?? right.id))
  return { count: rows.length, invoices: rows.slice(0, 20) }
}

export function buildAssistantPageRanges(count: number, pageSize = 400, maxRows = 100_000) {
  if (!Number.isInteger(count) || count < 0 || count > maxRows || pageSize < 1) throw new Error('Incomplete assistant data')
  return Array.from({ length: Math.ceil(count / pageSize) }, (_, index) => {
    const from = index * pageSize
    return { from, to: Math.min(from + pageSize, count) - 1 }
  })
}
