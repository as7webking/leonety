export interface ExchangeRateResponse {
  from: string
  to: string
  rate: string
  fetchedAt: string
  rateDate: string
  provider: string
  requestedDate?: string
}

const rateCache = new Map<string, { response: ExchangeRateResponse; expiresAt: number }>()
const MAX_RATE_CACHE_ENTRIES = 256

function cacheRate(key: string, response: ExchangeRateResponse) {
  const now = Date.now()
  for (const [cachedKey, entry] of rateCache) {
    if (entry.expiresAt <= now) rateCache.delete(cachedKey)
  }
  while (rateCache.size >= MAX_RATE_CACHE_ENTRIES) {
    const oldestKey = rateCache.keys().next().value
    if (oldestKey === undefined) break
    rateCache.delete(oldestKey)
  }
  rateCache.set(key, { response, expiresAt: now + 15 * 60 * 1000 })
}

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
  cacheRate(cacheKey, data)
  return data
}

export async function fetchHistoricalExchangeRate(from: string, to: string, date: string) {
  const cacheKey = `${from.toUpperCase()}:${to.toUpperCase()}:${date}`
  const cached = rateCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.response

  const params = new URLSearchParams({ from, to, date })
  const response = await fetch(`/api/exchange-rates?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('FX_RATE_UNAVAILABLE')

  const data = await response.json() as ExchangeRateResponse
  if (data.from.toUpperCase() !== from.toUpperCase()
    || data.to.toUpperCase() !== to.toUpperCase()
    || data.requestedDate !== date
    || !data.rate || !Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0
    || !data.fetchedAt || !data.rateDate || data.rateDate > date || !data.provider) {
    throw new Error('FX_RATE_UNAVAILABLE')
  }
  cacheRate(cacheKey, data)
  return data
}
