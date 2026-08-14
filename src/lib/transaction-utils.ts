export type TransactionType = 'income' | 'expense'

export interface ParsedTransactionCsvRow {
  type: TransactionType
  date: string
  description: string
  category: string
  amount: number
  currency: string
}

export interface TransactionImportIssue {
  row: number
  message: string
}

export function parseLocalizedAmount(value: string | number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN

  const compact = value.trim().replace(/\s/g, '')
  if (!compact) return Number.NaN

  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  const decimalSeparator = lastComma > lastDot ? ',' : '.'
  const normalized = compact
    .replace(decimalSeparator === ',' ? /\./g : /,/g, '')
    .replace(',', '.')

  return Number(normalized)
}

export function formatAmountInput(value: number | string | null | undefined) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  return Number.isFinite(value) ? String(value) : ''
}

export function validateSignedAmountInput(value: string | number, messages: { required: string; nonZero: string; invalid: string }) {
  if (typeof value === 'string' && !value.trim()) {
    throw new Error(messages.required)
  }

  const amount = parseLocalizedAmount(value)
  if (!Number.isFinite(amount)) {
    throw new Error(messages.invalid)
  }
  if (amount === 0) {
    throw new Error(messages.nonZero)
  }

  return Number(amount.toFixed(2))
}

export function parseTransactionDate(value: string) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const germanDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed)
  if (germanDate) {
    return `${germanDate[3]}-${germanDate[2]}-${germanDate[1]}`
  }

  return ''
}

export function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\uFEFF/, '')
}

export function getCsvColumnIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(header))
}
