export type KassenbuchTransactionType = 'income' | 'expense'

export interface KassenbuchTransaction {
  id: string
  type: KassenbuchTransactionType
  date: string
  amount: number
  currency: string
  title?: string | null
  description?: string | null
  reference?: string | null
  category?: string | null
  payment_method?: string | null
  created_at?: string | null
  cash_amount?: number | null
}

export interface KassenbuchTransactionRow {
  kind: 'transaction'
  transaction: KassenbuchTransaction
  incomeMinor: number | null
  expenseMinor: number | null
  balanceMinor: number
}

export interface KassenbuchClosingRow {
  kind: 'daily-closing'
  date: string
  balanceMinor: number
}

export type KassenbuchRow = KassenbuchTransactionRow | KassenbuchClosingRow

export interface KassenbuchResult {
  openingBalanceMinor: number
  closingBalanceMinor: number
  rows: KassenbuchRow[]
  excludedNonCashCount: number
  excludedCurrencyCount: number
  unclassifiedPaymentCount: number
}

const NON_CASH_METHODS = new Set(['bank_transfer', 'card'])

export function toMinorUnits(amount: number) {
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100)
}

export function getKassenbuchText(
  transaction: KassenbuchTransaction,
  genericLabel: string,
) {
  return transaction.title?.trim()
    || transaction.description?.trim()
    || transaction.reference?.trim()
    || transaction.category?.trim()
    || genericLabel
}

function isKnownNonCash(transaction: KassenbuchTransaction) {
  if (transaction.cash_amount !== null && transaction.cash_amount !== undefined) {
    return transaction.cash_amount === 0
  }
  return NON_CASH_METHODS.has(transaction.payment_method ?? '')
}

function isUnclassifiedPayment(transaction: KassenbuchTransaction) {
  if (transaction.cash_amount !== null && transaction.cash_amount !== undefined) return false
  return !transaction.payment_method
    || !['cash', 'bank_transfer', 'card'].includes(transaction.payment_method)
}

function compareTransactions(left: KassenbuchTransaction, right: KassenbuchTransaction) {
  return left.date.localeCompare(right.date)
    || (left.created_at ?? '').localeCompare(right.created_at ?? '')
    || left.id.localeCompare(right.id)
    || left.type.localeCompare(right.type)
}

function signedMinorAmount(transaction: KassenbuchTransaction) {
  const amountMinor = toMinorUnits(transaction.cash_amount ?? transaction.amount)
  return transaction.type === 'income' ? amountMinor : -amountMinor
}

export function buildKassenbuch({
  openingTransactions,
  periodTransactions,
  currency,
}: {
  openingTransactions: KassenbuchTransaction[]
  periodTransactions: KassenbuchTransaction[]
  currency: string
}): KassenbuchResult {
  const normalizedCurrency = currency.toUpperCase()
  const isEligible = (transaction: KassenbuchTransaction) => (
    transaction.currency.toUpperCase() === normalizedCurrency
    && !isKnownNonCash(transaction)
  )

  const openingBalanceMinor = openingTransactions
    .filter(isEligible)
    .reduce((balance, transaction) => balance + signedMinorAmount(transaction), 0)

  const rows: KassenbuchRow[] = []
  let balanceMinor = openingBalanceMinor
  let activeDate = ''

  for (const transaction of [...periodTransactions].sort(compareTransactions)) {
    if (transaction.currency.toUpperCase() !== normalizedCurrency || isKnownNonCash(transaction)) continue

    if (activeDate && activeDate !== transaction.date) {
      rows.push({ kind: 'daily-closing', date: activeDate, balanceMinor })
    }

    activeDate = transaction.date
    const amountMinor = toMinorUnits(transaction.cash_amount ?? transaction.amount)
    balanceMinor += transaction.type === 'income' ? amountMinor : -amountMinor
    rows.push({
      kind: 'transaction',
      transaction,
      incomeMinor: transaction.type === 'income' ? amountMinor : null,
      expenseMinor: transaction.type === 'expense' ? amountMinor : null,
      balanceMinor,
    })
  }

  if (activeDate) {
    rows.push({ kind: 'daily-closing', date: activeDate, balanceMinor })
  }

  return {
    openingBalanceMinor,
    closingBalanceMinor: balanceMinor,
    rows,
    excludedNonCashCount: periodTransactions.filter(
      (transaction) => transaction.currency.toUpperCase() === normalizedCurrency
        && isKnownNonCash(transaction),
    ).length,
    excludedCurrencyCount: periodTransactions.filter(
      (transaction) => transaction.currency.toUpperCase() !== normalizedCurrency,
    ).length,
    unclassifiedPaymentCount: periodTransactions.filter(
      (transaction) => transaction.currency.toUpperCase() === normalizedCurrency
        && !isKnownNonCash(transaction)
        && isUnclassifiedPayment(transaction),
    ).length,
  }
}
