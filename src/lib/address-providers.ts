import 'server-only'

export interface AddressSuggestion {
  id: string
  label: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  state: string
}

export type AddressProvider = 'nominatim' | 'google_maps'

interface SearchAddressInput {
  query: string
  country?: string
  signal?: AbortSignal
}

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

interface GoogleAddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface GoogleGeocodeResult {
  place_id: string
  formatted_address: string
  address_components?: GoogleAddressComponent[]
}

interface GoogleGeocodeResponse {
  status: string
  error_message?: string
  results?: GoogleGeocodeResult[]
}

export function getAddressProvider(): AddressProvider {
  return process.env.ADDRESS_PROVIDER === 'google_maps' ? 'google_maps' : 'nominatim'
}

function pickGoogleComponent(components: GoogleAddressComponent[] | undefined, type: string, short = false) {
  const component = components?.find((item) => item.types.includes(type))
  return short ? component?.short_name ?? '' : component?.long_name ?? ''
}

function mapGoogleAddress(item: GoogleGeocodeResult): AddressSuggestion {
  const streetNumber = pickGoogleComponent(item.address_components, 'street_number')
  const route = pickGoogleComponent(item.address_components, 'route')
  const city =
    pickGoogleComponent(item.address_components, 'locality') ||
    pickGoogleComponent(item.address_components, 'postal_town') ||
    pickGoogleComponent(item.address_components, 'administrative_area_level_2')

  return {
    id: item.place_id,
    label: item.formatted_address,
    street: route,
    houseNumber: streetNumber,
    postalCode: pickGoogleComponent(item.address_components, 'postal_code'),
    city,
    country: pickGoogleComponent(item.address_components, 'country'),
    state: pickGoogleComponent(item.address_components, 'administrative_area_level_1'),
  }
}

function mapNominatimAddress(item: NominatimResult, countryFallback: string): AddressSuggestion {
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
    country: address.country ?? countryFallback,
    state: address.state ?? '',
  }
}

export async function searchAddresses({ query, country = '', signal }: SearchAddressInput) {
  const provider = getAddressProvider()

  if (provider === 'google_maps') {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is required when ADDRESS_PROVIDER=google_maps.')
    }

    const params = new URLSearchParams({
      address: [query, country].filter(Boolean).join(', '),
      language: 'en',
    })

    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    })

    const payload = await response.json().catch(() => ({})) as GoogleGeocodeResponse
    if (!response.ok || payload.status === 'REQUEST_DENIED') {
      throw new Error(payload.error_message || 'Google Maps address provider is unavailable.')
    }
    if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
      throw new Error(payload.error_message || `Google Maps address search failed: ${payload.status}`)
    }

    return (payload.results ?? []).slice(0, 6).map(mapGoogleAddress)
  }

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
    signal,
  })

  if (!response.ok) {
    throw new Error('Address provider is temporarily unavailable.')
  }

  const data = await response.json() as NominatimResult[]
  return data.map((item) => mapNominatimAddress(item, country))
}
