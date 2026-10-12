export interface ExchangeRateResponse {
  from: string
  to: string
  rate: string
  fetchedAt: string
  rateDate: string
  provider: string
}

const rateCache = new Map<string, { response: ExchangeRateResponse; expiresAt: number }>()

export async function fetchLatestExchangeRate(from: string, to: string) {
  const cacheKey = `${from.toUpperCase()}:${to.toUpperCase()}`
  const cached = rateCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.response

  const response = await fetch(`/api/exchange-rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('FX_RATE_UNAVAILABLE')
  }

  const data = await response.json() as ExchangeRateResponse
  if (!data.rate || !data.fetchedAt || !data.rateDate || !data.provider) throw new Error('FX_RATE_UNAVAILABLE')
  rateCache.set(cacheKey, { response: data, expiresAt: Date.now() + 15 * 60 * 1000 })
  return data
}
