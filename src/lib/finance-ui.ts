export function matchesFinanceSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  return values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
}

export function matchesOptionalDateRange(date: string, fromDate: string, toDate: string) {
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
}

export function selectFinanceRecordsForPrint<T extends { id: string }>(records: T[], selectedIds: string[]) {
  if (selectedIds.length === 0) return records
  const selected = new Set(selectedIds)
  return records.filter((record) => selected.has(record.id))
}

export type FinanceSortBy = 'date' | 'amount' | 'title'
export type FinanceSortDirection = 'asc' | 'desc'

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

