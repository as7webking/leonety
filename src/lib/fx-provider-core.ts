export interface FxRateQuote {
  base: string
  quote: string
  rate: string
  rateDate: string
  fetchedAt: string
  provider: string
}

export interface FxRateProvider {
  readonly name: string
  getRate(base: string, quote: string, requestedDate?: string): Promise<Omit<FxRateQuote, 'provider'>>
}

type FrankfurterRate = { base?: string; quote?: string; rate?: number; date?: string }
const cache = new Map<string, { value: Omit<FxRateQuote, 'provider'>; expiresAt: number }>()
const inFlight = new Map<string, Promise<Omit<FxRateQuote, 'provider'>>>()
const CACHE_TTL_MS = 15 * 60 * 1000
const MAX_CACHE_ENTRIES = 2048

function cacheQuote(key: string, value: Omit<FxRateQuote, 'provider'>) {
  const now = Date.now()
  for (const [cachedKey, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(cachedKey)
  }
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const frankfurterFxProvider: FxRateProvider = {
  name: 'frankfurter',
  async getRate(base, quote, requestedDate) {
    const key = `${base}:${quote}:${requestedDate ?? 'latest'}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const pending = inFlight.get(key)
    if (pending) return pending

    const request = (async () => {
      if (requestedDate && !isIsoDate(requestedDate)) throw new Error('provider_invalid_date')
      const url = new URL(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`)
      if (requestedDate) url.searchParams.set('date', requestedDate)
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error(`provider_status_${response.status}`)

      const data = await response.json() as FrankfurterRate
      if (data.base?.toUpperCase() !== base || data.quote?.toUpperCase() !== quote
        || typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0
        || typeof data.date !== 'string' || !isIsoDate(data.date)
        || (requestedDate !== undefined && data.date > requestedDate)) {
        throw new Error('provider_invalid_response')
      }

      const value = {
        base,
        quote,
        rate: String(data.rate),
        rateDate: data.date,
        fetchedAt: new Date().toISOString(),
      }
      cacheQuote(key, value)
      return value
    })()
    inFlight.set(key, request)
    try {
      return await request
    } finally {
      inFlight.delete(key)
    }
  },
}

export async function getFxRate(
  base: string,
  quote: string,
  provider: FxRateProvider = frankfurterFxProvider,
  requestedDate?: string
): Promise<FxRateQuote> {
  return { ...await provider.getRate(base, quote, requestedDate), provider: provider.name }
}
