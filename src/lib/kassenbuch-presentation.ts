import type { KassenbuchMonth, KassenbuchResult, KassenbuchTransactionRow } from './kassenbuch'

export type KassenbuchPrintOrder = 'chronological' | 'income-first' | 'expenses-first' | 'custom'
export type KassenbuchCustomOrder = Record<string, string[]>

export const KASSENBUCH_PRINT_ORDER_KEY = 'leonety-kassenbuch-print-order'

export function kassenbuchTransactionKey(row: KassenbuchTransactionRow) {
  return `${row.transaction.type}:${row.transaction.id}`
}

export function parseKassenbuchPrintOrder(value: string | null | undefined): KassenbuchPrintOrder {
  return value === 'income-first' || value === 'expenses-first' || value === 'custom'
    ? value
    : 'chronological'
}

export function parseKassenbuchCustomOrder(value: string | null): KassenbuchCustomOrder {
  if (!value || value.length > 500_000) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
      .filter(([date, ids]) => /^\d{4}-\d{2}-\d{2}$/.test(date)
        && Array.isArray(ids)
        && ids.length <= 2_000
        && ids.every((id) => typeof id === 'string' && id.length <= 128))
      .slice(0, 366)) as KassenbuchCustomOrder
  } catch {
    return {}
  }
}

export function getKassenbuchDays(result: KassenbuchResult) {
  const days = new Map<string, KassenbuchTransactionRow[]>()
  for (const month of result.months) {
    for (const row of month.rows) {
      if (row.kind !== 'transaction') continue
      const current = days.get(row.transaction.date) ?? []
      current.push(row)
      days.set(row.transaction.date, current)
    }
  }
  return [...days].map(([date, transactions]) => ({ date, transactions }))
}

function rank(type: KassenbuchTransactionRow['transaction']['type'], order: KassenbuchPrintOrder) {
  if (order === 'income-first') return type === 'income' ? 0 : 1
  if (order === 'expenses-first') return type === 'expense' ? 0 : 1
  return 0
}

function orderMonthRows(month: KassenbuchMonth, order: KassenbuchPrintOrder, customOrder: KassenbuchCustomOrder) {
  if (order === 'chronological') return month.rows
  const transactionsByDate = new Map<string, KassenbuchTransactionRow[]>()
  const closingByDate = new Map<string, Extract<KassenbuchMonth['rows'][number], { kind: 'daily-closing' }>>()

  for (const row of month.rows) {
    if (row.kind === 'transaction') {
      const current = transactionsByDate.get(row.transaction.date) ?? []
      current.push(row)
      transactionsByDate.set(row.transaction.date, current)
    } else {
      closingByDate.set(row.date, row)
    }
  }

  const dates = [...new Set([...transactionsByDate.keys(), ...closingByDate.keys()])].sort()
  return dates.flatMap((date) => {
    const transactions = transactionsByDate.get(date) ?? []
    if (order === 'custom') {
      const rankById = new Map((customOrder[date] ?? []).map((id, index) => [id, index]))
      transactions.sort((left, right) => (
        (rankById.get(kassenbuchTransactionKey(left)) ?? Number.MAX_SAFE_INTEGER)
        - (rankById.get(kassenbuchTransactionKey(right)) ?? Number.MAX_SAFE_INTEGER)
      ))
    } else {
      transactions.sort((left, right) => rank(left.transaction.type, order) - rank(right.transaction.type, order))
    }
    const closing = closingByDate.get(date)
    return closing ? [...transactions, closing] : transactions
  })
}

export function buildKassenbuchPresentation(
  result: KassenbuchResult,
  order: KassenbuchPrintOrder,
  customOrder: KassenbuchCustomOrder = {},
): KassenbuchResult {
  if (order === 'chronological') return result
  const months = result.months.map((month) => ({ ...month, rows: orderMonthRows(month, order, customOrder) }))
  return { ...result, months }
}
