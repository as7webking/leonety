import 'server-only'

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
  getRate(base: string, quote: string): Promise<Omit<FxRateQuote, 'provider'>>
}

type FrankfurterRate = { base?: string; quote?: string; rate?: number; date?: string }
const cache = new Map<string, { value: Omit<FxRateQuote, 'provider'>; expiresAt: number }>()
const inFlight = new Map<string, Promise<Omit<FxRateQuote, 'provider'>>>()
const CACHE_TTL_MS = 15 * 60 * 1000

export const frankfurterFxProvider: FxRateProvider = {
  name: 'frankfurter',
  async getRate(base, quote) {
    const key = `${base}:${quote}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const pending = inFlight.get(key)
    if (pending) return pending

    const request = (async () => {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${base.toLowerCase()}/${quote.toLowerCase()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error(`provider_status_${response.status}`)

      const data = await response.json() as FrankfurterRate
      if (data.base?.toUpperCase() !== base || data.quote?.toUpperCase() !== quote
        || typeof data.rate !== 'number' || !Number.isFinite(data.rate) || data.rate <= 0
        || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        throw new Error('provider_invalid_response')
      }

      const value = {
        base,
        quote,
        rate: String(data.rate),
        rateDate: data.date,
        fetchedAt: new Date().toISOString(),
      }
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
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

export async function getFxRate(base: string, quote: string, provider: FxRateProvider = frankfurterFxProvider): Promise<FxRateQuote> {
  return { ...await provider.getRate(base, quote), provider: provider.name }
}
