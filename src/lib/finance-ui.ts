export function matchesFinanceSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  return values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
}

export function matchesOptionalDateRange(date: string, fromDate: string, toDate: string) {
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
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

