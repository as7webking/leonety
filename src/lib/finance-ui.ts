export function matchesFinanceSearch(query: string, values: Array<string | null | undefined>) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true

  return values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
}

export function matchesOptionalDateRange(date: string, fromDate: string, toDate: string) {
  return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
}

