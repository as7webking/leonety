import { NextResponse } from 'next/server'
import { isSupportedCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { getFxRate } from '@/lib/fx-provider'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawFrom = searchParams.get('from') ?? ''
  const rawTo = searchParams.get('to') ?? ''
  if (!isSupportedCurrency(rawFrom) || !isSupportedCurrency(rawTo)) {
    return NextResponse.json({ error: 'unsupported_currency' }, { status: 400 })
  }
  const from = normalizeCurrencyCode(rawFrom)
  const to = normalizeCurrencyCode(rawTo)
  const fetchedAt = new Date().toISOString()

  if (from === to) {
    return NextResponse.json({
      from,
      to,
      rate: '1',
      rateDate: fetchedAt.slice(0, 10),
      fetchedAt,
      provider: 'identity',
    })
  }

  try {
    const quote = await getFxRate(from, to)
    return NextResponse.json({
      from,
      to,
      rate: quote.rate,
      rateDate: quote.rateDate,
      fetchedAt: quote.fetchedAt,
      provider: quote.provider,
    })
  } catch {
    return NextResponse.json({ error: 'exchange_rate_unavailable' }, { status: 503 })
  }
}
