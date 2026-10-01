import 'server-only'

export interface AddressSuggestion {
  id: string
  label: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  countryCode: string
  state: string
  requiresDetails: boolean
}

export type AddressProvider = 'nominatim' | 'google_maps'

interface SearchAddressInput {
  query: string
  countryCode?: string
  languageCode?: string
  sessionToken?: string
  signal?: AbortSignal
}

interface ResolveAddressInput {
  placeId: string
  languageCode?: string
  sessionToken?: string
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
  country_code?: string
  state?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  address?: NominatimAddress
}

interface GoogleAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: { text?: string }
    }
  }>
}

interface GoogleAddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

interface GooglePlaceDetails {
  id?: string
  formattedAddress?: string
  addressComponents?: GoogleAddressComponent[]
}

export function getAddressProvider(): AddressProvider {
  return process.env.ADDRESS_PROVIDER === 'google_maps' ? 'google_maps' : 'nominatim'
}

function getGoogleMapsApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) throw new Error('google_maps_configuration_missing')
  return apiKey
}

function normalizeLanguageCode(value?: string) {
  return /^(en|de|ru|tr|uk|pl|fr)$/i.test(value ?? '') ? value!.toLowerCase() : 'en'
}

function normalizeCountryCode(value?: string) {
  return /^[a-z]{2}$/i.test(value ?? '') ? value!.toUpperCase() : ''
}

function pickGoogleComponent(components: GoogleAddressComponent[] | undefined, type: string, short = false) {
  const component = components?.find((item) => item.types?.includes(type))
  return short ? component?.shortText ?? '' : component?.longText ?? ''
}

export function mapGooglePlaceDetails(item: GooglePlaceDetails): AddressSuggestion {
  const streetNumber = pickGoogleComponent(item.addressComponents, 'street_number')
  const route = pickGoogleComponent(item.addressComponents, 'route')
  const city =
    pickGoogleComponent(item.addressComponents, 'locality') ||
    pickGoogleComponent(item.addressComponents, 'postal_town') ||
    pickGoogleComponent(item.addressComponents, 'administrative_area_level_2')

  return {
    id: item.id ?? '',
    label: item.formattedAddress ?? '',
    street: route,
    houseNumber: streetNumber,
    postalCode: pickGoogleComponent(item.addressComponents, 'postal_code'),
    city,
    country: pickGoogleComponent(item.addressComponents, 'country'),
    countryCode: pickGoogleComponent(item.addressComponents, 'country', true).toUpperCase(),
    state: pickGoogleComponent(item.addressComponents, 'administrative_area_level_1'),
    requiresDetails: false,
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
    countryCode: address.country_code?.toUpperCase() ?? normalizeCountryCode(countryFallback),
    state: address.state ?? '',
    requiresDetails: false,
  }
}

async function searchGoogleAddresses({ query, countryCode, languageCode, sessionToken, signal }: SearchAddressInput) {
  const normalizedCountry = normalizeCountryCode(countryCode)
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': getGoogleMapsApiKey(),
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
    },
    body: JSON.stringify({
      input: query,
      languageCode: normalizeLanguageCode(languageCode),
      ...(normalizedCountry ? { includedRegionCodes: [normalizedCountry.toLowerCase()] } : {}),
      ...(sessionToken ? { sessionToken } : {}),
    }),
    cache: 'no-store',
    signal,
  })
  const payload = await response.json().catch(() => ({})) as GoogleAutocompleteResponse
  if (!response.ok) throw new Error(`google_places_autocomplete_${response.status}`)

  return (payload.suggestions ?? []).flatMap<AddressSuggestion>((item) => {
    const id = item.placePrediction?.placeId?.trim()
    const label = item.placePrediction?.text?.text?.trim()
    if (!id || !label) return []
    return [{
      id,
      label,
      street: '',
      houseNumber: '',
      postalCode: '',
      city: '',
      country: '',
      countryCode: '',
      state: '',
      requiresDetails: true,
    }]
  }).slice(0, 6)
}

export async function resolveGoogleAddress({ placeId, languageCode, sessionToken, signal }: ResolveAddressInput) {
  const params = new URLSearchParams({ languageCode: normalizeLanguageCode(languageCode) })
  if (sessionToken) params.set('sessionToken', sessionToken)
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Goog-Api-Key': getGoogleMapsApiKey(),
      'X-Goog-FieldMask': 'id,formattedAddress,addressComponents',
    },
    cache: 'no-store',
    signal,
  })
  const payload = await response.json().catch(() => ({})) as GooglePlaceDetails
  if (!response.ok) throw new Error(`google_place_details_${response.status}`)
  return mapGooglePlaceDetails(payload)
}

export async function searchAddresses(input: SearchAddressInput) {
  if (getAddressProvider() === 'google_maps') return searchGoogleAddresses(input)

  const countryCode = normalizeCountryCode(input.countryCode)
  const params = new URLSearchParams({
    q: input.query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    ...(countryCode ? { countrycodes: countryCode.toLowerCase() } : {}),
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': normalizeLanguageCode(input.languageCode),
      'User-Agent': 'Leonety address autocomplete',
    },
    cache: 'no-store',
    signal: input.signal,
  })
  if (!response.ok) throw new Error(`nominatim_${response.status}`)

  const data = await response.json() as NominatimResult[]
  return data.map((item) => mapNominatimAddress(item, countryCode))
}
