// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { multiplyMoneyByRate, roundDecimalToScale } from './decimal-money.ts'

export interface HistoricalRateQuote {
  from: string
  to: string
  rate: string
  rateDate: string
  fetchedAt: string
  provider: string
  requestedDate?: string
}

export interface TransactionFxSnapshotData {
  workspace_amount: string | null
  workspace_currency: string
  exchange_rate: string
  exchange_rate_source: string | null
  exchange_rate_at: string | null
  exchange_rate_date: string | null
}

export interface HistoricalTransactionFxResult {
  snapshot: TransactionFxSnapshotData
  verified: boolean
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function transactionFxInputsChanged(
  previous: { amount: number | string; currency: string; date: string },
  next: { amount: number | string; currency: string; date: string }
) {
  return Number(previous.amount) !== Number(next.amount)
    || previous.currency.trim().toUpperCase() !== next.currency.trim().toUpperCase()
    || previous.date !== next.date
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapItem: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)))
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapItem(items[index], index)
    }
  }))
  return results
}

export function buildHistoricalTransactionFxSnapshot(
  amount: number | string,
  from: string,
  to: string,
  transactionDate: string,
  quote?: HistoricalRateQuote
): HistoricalTransactionFxResult {
  const amountText = typeof amount === 'number' ? amount.toFixed(2) : amount

  if (from === to) {
    return {
      verified: true,
      snapshot: {
        workspace_amount: multiplyMoneyByRate(amountText, '1', to),
        workspace_currency: to,
        exchange_rate: '1',
        exchange_rate_source: 'identity',
        exchange_rate_at: new Date().toISOString(),
        exchange_rate_date: transactionDate,
      },
    }
  }

  const validQuote = quote
    && quote.from.toUpperCase() === from
    && quote.to.toUpperCase() === to
    && quote.requestedDate === transactionDate
    && isIsoDate(quote.rateDate)
    && isIsoDate(transactionDate)
    && quote.rateDate <= transactionDate
    && Number.isFinite(Number(quote.rate))
    && Number(quote.rate) > 0
    && Boolean(quote.provider && Number.isFinite(Date.parse(quote.fetchedAt)))

  if (!validQuote) {
    return {
      verified: false,
      snapshot: {
        workspace_amount: null,
        workspace_currency: to,
        // The legacy column is NOT NULL; source=null marks this sentinel as unverified.
        exchange_rate: '1',
        exchange_rate_source: null,
        exchange_rate_at: null,
        exchange_rate_date: null,
      },
    }
  }

  const rate = roundDecimalToScale(quote.rate, 8)
  return {
    verified: true,
    snapshot: {
      workspace_amount: multiplyMoneyByRate(amountText, rate, to),
      workspace_currency: to,
      exchange_rate: rate,
      exchange_rate_source: quote.provider,
      exchange_rate_at: quote.fetchedAt,
      exchange_rate_date: quote.rateDate,
    },
  }
}

export async function resolveHistoricalTransactionFxSnapshot(
  amount: number | string,
  from: string,
  to: string,
  transactionDate: string,
  fetchQuote: (base: string, quote: string, date: string) => Promise<HistoricalRateQuote>
): Promise<HistoricalTransactionFxResult> {
  if (from === to) return buildHistoricalTransactionFxSnapshot(amount, from, to, transactionDate)
  try {
    const quote = await fetchQuote(from, to, transactionDate)
    return buildHistoricalTransactionFxSnapshot(amount, from, to, transactionDate, quote)
  } catch {
    return buildHistoricalTransactionFxSnapshot(amount, from, to, transactionDate)
  }
}
