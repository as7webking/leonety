import 'server-only'
import { getSiteUrl } from '@/lib/site-url'

export const GOOGLE_CONTACTS_COOKIE = 'leonety_google_contacts_token'
export const GOOGLE_CONTACTS_STATE_COOKIE = 'leonety_google_contacts_state'
export const GOOGLE_CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly'

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required server-side for Google Contacts import.`)
  }
  return value
}

export function getGoogleContactsClientConfig() {
  return {
    clientId: getRequiredEnv('GOOGLE_CONTACTS_CLIENT_ID'),
    clientSecret: getRequiredEnv('GOOGLE_CONTACTS_CLIENT_SECRET'),
    redirectUri: new URL('/api/clients/google-contacts/callback', getSiteUrl()).toString(),
  }
}

export function getGoogleContactsAuthUrl(state: string) {
  const config = getGoogleContactsClientConfig()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_CONTACTS_SCOPE)
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)
  return url
}

export async function exchangeGoogleContactsCode(code: string) {
  const config = getGoogleContactsClientConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Google Contacts authorization failed.')
  }

  return payload.access_token
}

export interface GoogleContactPreviewRow {
  name: string
  email: string
  phone: string
  client_company: string
  street: string
  house_number: string
  postal_code: string
  city: string
  country: string
  interested_in: string
  notes: string
  external_id: string
}

function firstValue<T>(items: T[] | undefined, getter: (item: T) => string | undefined) {
  return items?.map(getter).find(Boolean) ?? ''
}

export async function fetchGoogleContactsPreview(accessToken: string): Promise<GoogleContactPreviewRow[]> {
  const url = new URL('https://people.googleapis.com/v1/people/me/connections')
  url.searchParams.set('personFields', 'names,emailAddresses,phoneNumbers,organizations,addresses')
  url.searchParams.set('pageSize', '200')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as {
    connections?: Array<{
      resourceName?: string
      names?: Array<{ displayName?: string }>
      emailAddresses?: Array<{ value?: string }>
      phoneNumbers?: Array<{ value?: string }>
      organizations?: Array<{ name?: string }>
      addresses?: Array<{
        streetAddress?: string
        city?: string
        postalCode?: string
        country?: string
      }>
    }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not read Google Contacts.')
  }

  return (payload.connections ?? []).map((person) => {
    const address = person.addresses?.[0]
    return {
      name: firstValue(person.names, (item) => item.displayName) || firstValue(person.emailAddresses, (item) => item.value) || firstValue(person.phoneNumbers, (item) => item.value),
      email: firstValue(person.emailAddresses, (item) => item.value),
      phone: firstValue(person.phoneNumbers, (item) => item.value),
      client_company: firstValue(person.organizations, (item) => item.name),
      street: address?.streetAddress ?? '',
      house_number: '',
      postal_code: address?.postalCode ?? '',
      city: address?.city ?? '',
      country: address?.country ?? '',
      interested_in: '',
      notes: '',
      external_id: person.resourceName ?? '',
    }
  }).filter((row) => row.name || row.email || row.phone)
}
