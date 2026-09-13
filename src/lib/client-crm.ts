import { formatCurrency, normalizeCurrencyCode } from '@/lib/currency'

export const clientStatuses = ['lead', 'interested', 'proposal_sent', 'client', 'inactive'] as const
export type ClientStatus = typeof clientStatuses[number]

export interface ClientRecord {
  id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  client_company: string | null
  street: string | null
  house_number: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  tax_number: string | null
  interested_in: string | null
  notes: string | null
  source: string | null
  external_id: string | null
  first_contact_at: string | null
  last_activity_at: string | null
  status: ClientStatus
  created_at: string
  updated_at: string | null
}

export interface ClientFormValues {
  clientType: 'person' | 'company'
  name: string
  client_company: string
  email: string
  phone: string
  street: string
  house_number: string
  postal_code: string
  city: string
  country: string
  tax_number: string
  interested_in: string
  notes: string
  status: ClientStatus
}

export const emptyClientForm: ClientFormValues = {
  clientType: 'person',
  name: '',
  client_company: '',
  email: '',
  phone: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  country: '',
  tax_number: '',
  interested_in: '',
  notes: '',
  status: 'lead',
}

export function clientToForm(client: ClientRecord): ClientFormValues {
  return {
    clientType: client.client_company ? 'company' : 'person',
    name: client.name,
    client_company: client.client_company ?? '',
    email: client.email ?? '',
    phone: client.phone ?? '',
    street: client.street ?? '',
    house_number: client.house_number ?? '',
    postal_code: client.postal_code ?? '',
    city: client.city ?? '',
    country: client.country ?? '',
    tax_number: client.tax_number ?? '',
    interested_in: client.interested_in ?? '',
    notes: client.notes ?? '',
    status: client.status,
  }
}

export function formatCurrencyGroups(values: Record<string, number>, locale: string, fallbackCurrency = 'EUR') {
  const allEntries = Object.entries(values)
  const entries = allEntries.filter(([, amount]) => Math.abs(amount) >= 0.005)
  if (entries.length === 0) return formatCurrency(0, allEntries[0]?.[0] ?? fallbackCurrency, locale)
  return entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrency(amount, normalizeCurrencyCode(currency), locale))
    .join(' / ')
}
