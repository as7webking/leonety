export function matchesFinanceSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  return values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
}

export function matchesOptionalDateRange(date: string, fromDate: string, toDate: string) {
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
}

function isDateOnly(value: string) {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isValidOptionalDateRange(fromDate: string, toDate: string) {
  return isDateOnly(fromDate) && isDateOnly(toDate) && (!fromDate || !toDate || fromDate <= toDate)
}

export function filterFinanceRecordsByDate<T extends { date: string }>(records: readonly T[], fromDate: string, toDate: string) {
  if (!isValidOptionalDateRange(fromDate, toDate)) return []
  return records.filter((record) => matchesOptionalDateRange(record.date, fromDate, toDate))
}

export type FinanceDatePreset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'

function localDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getFinanceDatePresetRange(preset: Exclude<FinanceDatePreset, 'custom'>, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  if (preset === 'all') return { fromDate: '', toDate: '' }
  if (preset === 'thisYear') return { fromDate: localDateInputValue(new Date(year, 0, 1)), toDate: localDateInputValue(new Date(year, 11, 31)) }
  if (preset === 'lastMonth') return { fromDate: localDateInputValue(new Date(year, month - 1, 1)), toDate: localDateInputValue(new Date(year, month, 0)) }
  return { fromDate: localDateInputValue(new Date(year, month, 1)), toDate: localDateInputValue(new Date(year, month + 1, 0)) }
}

export function getFinanceDatePreset(fromDate: string, toDate: string, now = new Date()): FinanceDatePreset {
  if (!fromDate && !toDate) return 'all'
  for (const preset of ['thisMonth', 'lastMonth', 'thisYear'] as const) {
    const range = getFinanceDatePresetRange(preset, now)
    if (range.fromDate === fromDate && range.toDate === toDate) return preset
  }
  return 'custom'
}

export function selectFinanceRecordsForPrint<T extends { id: string }>(records: T[], selectedIds: string[]) {
  if (selectedIds.length === 0) return records
  const selected = new Set(selectedIds)
  return records.filter((record) => selected.has(record.id))
}

export type FinanceSortBy = 'date' | 'amount' | 'title'
export type FinanceSortDirection = 'asc' | 'desc'
export const FINANCE_PAGE_SIZES = [10, 25, 50, 100] as const

export function normalizeFinancePageSize(value: unknown) {
  const size = typeof value === 'string' ? Number(value) : value
  return typeof size === 'number' && FINANCE_PAGE_SIZES.includes(size as (typeof FINANCE_PAGE_SIZES)[number]) ? size : 25
}

export function paginateFinanceRecords<T>(records: readonly T[], requestedPage: number, requestedPageSize: unknown) {
  const pageSize = normalizeFinancePageSize(requestedPageSize)
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
  const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), totalPages)
  const start = (page - 1) * pageSize
  return { items: records.slice(start, start + pageSize), page, pageSize, totalPages }
}

export function sortFinanceRecords<T extends { id: string; date: string; amount: number | string; title?: string | null; description?: string | null }>(
  records: T[],
  sortBy: FinanceSortBy,
  direction: FinanceSortDirection,
  locale: string,
) {
  return [...records].sort((left, right) => {
    let comparison = 0
    if (sortBy === 'date') {
      comparison = new Date(left.date).getTime() - new Date(right.date).getTime()
    } else if (sortBy === 'amount') {
      comparison = Number(left.amount) - Number(right.amount)
    } else {
      comparison = (left.title || left.description || '').localeCompare(right.title || right.description || '', locale, { sensitivity: 'base', numeric: true })
    }

    if (comparison !== 0) return direction === 'asc' ? comparison : -comparison
    return left.id.localeCompare(right.id)
  })
}

export function formatHistoricalRateDetail(input: {
  rate: number | string | null | undefined
  source: string | null | undefined
  rateDate: string | null | undefined
  fromCurrency: string
  toCurrency: string
  locale: string
  label: string
}) {
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate <= 0 || !input.rateDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.rateDate)) return null

  const rateDate = new Date(`${input.rateDate}T12:00:00`)
  if (Number.isNaN(rateDate.getTime()) || rateDate.toISOString().slice(0, 10) !== input.rateDate) return null

  const formattedRate = rate.toLocaleString(input.locale, { maximumFractionDigits: 8 })
  const formattedDate = rateDate.toLocaleDateString(input.locale)
  const source = input.source ? ` · ${input.source}` : ''
  return `${input.label}: 1 ${input.fromCurrency} = ${formattedRate} ${input.toCurrency} · ${formattedDate}${source}`
}

