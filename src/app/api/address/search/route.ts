import { NextResponse } from 'next/server'
import { searchAddresses } from '@/lib/address-providers'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const query = requestUrl.searchParams.get('q')?.trim() ?? ''
  const country = requestUrl.searchParams.get('country')?.trim() ?? ''

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    const suggestions = await searchAddresses({ query, country, signal: controller.signal })
    return NextResponse.json({ suggestions })
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Address search timed out.'
      : 'Address search failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
