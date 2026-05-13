import { NextResponse } from 'next/server'
import { convertToCurrency, normalizeCurrencyCode } from '@/lib/currency'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = normalizeCurrencyCode(searchParams.get('from') ?? 'USD')
  const to = normalizeCurrencyCode(searchParams.get('to') ?? 'USD')

  if (from === to) {
    return NextResponse.json({
      from,
      to,
      rate: 1,
      fetchedAt: new Date().toISOString(),
      provider: 'local',
    })
  }

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
      method: 'GET',
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Exchange rate request failed with ${response.status}`)
    }

    const data = await response.json() as { rates?: Record<string, number>; date?: string }
    const rate = data.rates?.[to]

    if (!rate || !Number.isFinite(rate)) {
      throw new Error('Exchange rate response did not include a valid rate')
    }

    return NextResponse.json({
      from,
      to,
      rate,
      fetchedAt: data.date ?? new Date().toISOString(),
      provider: 'frankfurter',
    })
  } catch (error) {
    console.error('Exchange rate lookup failed:', error)
    return NextResponse.json({
      from,
      to,
      rate: convertToCurrency(1, from, to),
      fetchedAt: new Date().toISOString(),
      provider: 'local-fallback',
    })
  }
}
