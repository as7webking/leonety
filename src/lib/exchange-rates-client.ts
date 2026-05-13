export interface ExchangeRateResponse {
  from: string
  to: string
  rate: number
  fetchedAt: string
  provider: string
}

export async function fetchLatestExchangeRate(from: string, to: string) {
  const response = await fetch(`/api/exchange-rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    const fallbackText = await response.text().catch(() => '')
    throw new Error(fallbackText || 'Failed to load exchange rate')
  }

  return response.json() as Promise<ExchangeRateResponse>
}
