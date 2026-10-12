import { fetchLatestExchangeRate } from '@/lib/exchange-rates-client'
import { normalizeCurrencyCode } from '@/lib/currency'
import { multiplyMoneyByRate, roundDecimalToScale } from '@/lib/decimal-money'

export { getStoredWorkspaceAmount } from '@/lib/decimal-money'

export interface TransactionFxSnapshot {
  workspace_amount: string
  workspace_currency: string
  exchange_rate: string
  exchange_rate_source: string
  exchange_rate_at: string
  exchange_rate_date: string
}

export function getMoneyConversionPreview(amount: string, rate: string | null, currency: string) {
  if (!rate || !/^-?\d+(?:[.,]\d+)?$/.test(amount.trim())) return null
  try {
    return multiplyMoneyByRate(amount.trim().replace(',', '.'), rate, currency)
  } catch {
    return null
  }
}

export async function createTransactionFxSnapshot(
  amount: number | string,
  transactionCurrency: string,
  workspaceCurrency: string
): Promise<TransactionFxSnapshot> {
  const from = normalizeCurrencyCode(transactionCurrency)
  const to = normalizeCurrencyCode(workspaceCurrency)
  const amountText = typeof amount === 'number' ? amount.toFixed(2) : amount

  if (from === to) {
    const now = new Date().toISOString()
    return {
      workspace_amount: multiplyMoneyByRate(amountText, '1', to),
      workspace_currency: to,
      exchange_rate: '1',
      exchange_rate_source: 'identity',
      exchange_rate_at: now,
      exchange_rate_date: now.slice(0, 10),
    }
  }

  const quote = await fetchLatestExchangeRate(from, to)
  const rate = roundDecimalToScale(quote.rate, 8)
  return {
    workspace_amount: multiplyMoneyByRate(amountText, rate, to),
    workspace_currency: to,
    exchange_rate: rate,
    exchange_rate_source: quote.provider,
    exchange_rate_at: quote.fetchedAt,
    exchange_rate_date: quote.rateDate,
  }
}
