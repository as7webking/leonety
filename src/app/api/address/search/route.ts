import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  road?: string
  pedestrian?: string
  footway?: string
  house_number?: string
  postcode?: string
  country?: string
  state?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  address?: NominatimAddress
}

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
    const params = new URLSearchParams({
      q: [query, country].filter(Boolean).join(', '),
      format: 'jsonv2',
      addressdetails: '1',
      limit: '6',
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Leonety address autocomplete',
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Address provider is temporarily unavailable.' }, { status: 502 })
    }

    const data = await response.json() as NominatimResult[]
    const suggestions = data.map((item) => {
      const address = item.address ?? {}
      const street = address.road ?? address.pedestrian ?? address.footway ?? ''
      const city = address.city ?? address.town ?? address.village ?? address.municipality ?? ''

      return {
        id: String(item.place_id),
        label: item.display_name,
        street,
        houseNumber: address.house_number ?? '',
        postalCode: address.postcode ?? '',
        city,
        country: address.country ?? country,
        state: address.state ?? '',
      }
    })

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
