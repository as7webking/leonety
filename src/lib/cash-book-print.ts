import type { CashBookBalance } from './cash-book'

export interface CashBookPrintRow {
  id: string
  date: string
  incomeMinor: number | null
  expenseMinor: number | null
  balanceMinor: number
  text: string
  receiptReference: string | null
}

export interface CashBookPrintModel {
  workspaceName: string
  registerName: string
  currency: string
  periodStart: string
  periodEnd: string
  openingBalanceMinor: number
  closingBalanceMinor: number
  rows: CashBookPrintRow[]
}

export function buildCashBookPrintModel(params: {
  balance: CashBookBalance
  workspaceName: string
  registerName: string
  currency: string
  periodStart: string
  periodEnd: string
}): CashBookPrintModel {
  const { balance, periodStart, periodEnd } = params
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }
  if (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd) {
    throw new Error('A valid inclusive cash-book date range is required.')
  }
  if (balance.rows.some((row) => row.entry.currency.toUpperCase() !== params.currency.toUpperCase())) {
    throw new Error('Cash-book print currency must match every register entry.')
  }

  let openingBalanceMinor = 0
  let closingBalanceMinor = 0
  const rows: CashBookPrintRow[] = []

  for (const row of balance.rows) {
    if (row.entry.date < periodStart) openingBalanceMinor = row.balanceMinor
    if (row.entry.date <= periodEnd) closingBalanceMinor = row.balanceMinor
    if (row.entry.date < periodStart || row.entry.date > periodEnd) continue

    const isOpening = row.entry.kind === 'opening'
    const incomeMinor = !isOpening && row.signedAmountMinor > 0 ? row.signedAmountMinor : null
    const expenseMinor = !isOpening && row.signedAmountMinor < 0 ? Math.abs(row.signedAmountMinor) : null
    const receipt = row.entry.receiptReference?.trim() || null

    rows.push({
      id: row.entry.id,
      date: row.entry.date,
      incomeMinor,
      expenseMinor,
      balanceMinor: row.balanceMinor,
      text: row.entry.description.trim(),
      receiptReference: receipt,
    })
  }

  return {
    workspaceName: params.workspaceName,
    registerName: params.registerName,
    currency: params.currency.toUpperCase(),
    periodStart,
    periodEnd,
    openingBalanceMinor,
    closingBalanceMinor,
    rows,
  }
}
