import 'server-only'
import { getSiteUrl } from '@/lib/site-url'

export const storeProviders = [
  'woocommerce',
  'shopify',
  'opencart',
  'google_merchant',
  'whatsapp_business',
  'iss_pos',
  'uber_eats',
  'just_eat_takeaway',
  'glovo',
] as const

export type StoreProvider = typeof storeProviders[number]

export function isStoreProvider(value: unknown): value is StoreProvider {
  return typeof value === 'string' && storeProviders.includes(value as StoreProvider)
}

export function normalizeStoreUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Store URL must use HTTP or HTTPS.')
  }

  return url.origin + url.pathname.replace(/\/+$/, '')
}

export function normalizeShopifyShop(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')

  if (!trimmed) {
    throw new Error('Shopify shop domain is required.')
  }

  return trimmed.endsWith('.myshopify.com') ? trimmed : `${trimmed}.myshopify.com`
}

export function getStoreIntegrationCallbackUrl(provider: StoreProvider) {
  const url = new URL('/api/store-integrations/oauth/callback', getSiteUrl())
  url.searchParams.set('provider', provider)
  return url.toString()
}
