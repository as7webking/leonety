import { NextResponse } from 'next/server'
import { getAddressProvider, resolveGoogleAddress, searchAddresses } from '@/lib/address-providers'
import { normalizeLocale } from '@/lib/i18n'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = crypto.randomUUID()
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const query = requestUrl.searchParams.get('q')?.trim().slice(0, 200) ?? ''
  const countryCode = requestUrl.searchParams.get('country')?.trim() ?? ''
  const placeId = requestUrl.searchParams.get('placeId')?.trim().slice(0, 256) ?? ''
  const sessionToken = requestUrl.searchParams.get('sessionToken')?.trim().slice(0, 80) ?? ''
  const languageCode = normalizeLocale(requestUrl.searchParams.get('locale'))

  if (!placeId && query.length < 3) {
    return NextResponse.json({ suggestions: [], provider: getAddressProvider() })
  }
  if (placeId && getAddressProvider() !== 'google_maps') {
    return NextResponse.json({ error: 'address_details_unavailable' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    if (placeId) {
      const suggestion = await resolveGoogleAddress({ placeId, languageCode, sessionToken, signal: controller.signal })
      return NextResponse.json({ suggestion, provider: 'google_maps' })
    }
    const suggestions = await searchAddresses({ query, countryCode, languageCode, sessionToken, signal: controller.signal })
    return NextResponse.json({ suggestions, provider: getAddressProvider() })
  } catch (error) {
    console.warn('[address-search]', {
      requestId,
      provider: getAddressProvider(),
      errorType: error instanceof Error ? error.message : typeof error,
    })
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'address_search_timeout'
      : error instanceof Error && error.message === 'google_maps_configuration_missing'
        ? 'address_provider_not_configured'
        : 'address_search_failed'
    const status = error instanceof Error && error.name === 'AbortError'
      ? 504
      : error instanceof Error && error.message === 'google_maps_configuration_missing'
        ? 503
        : 502
    return NextResponse.json({ error: message, requestId }, { status })
  } finally {
    clearTimeout(timeout)
  }
}
