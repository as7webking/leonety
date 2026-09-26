export const storeProviders = [
  'woocommerce',
  'shopify',
  'opencart',
  'google_merchant',
  'whatsapp_business',
  'iss_pos',
  'ebay',
  'amazon_marketplace',
  'kleinanzeigen',
  'olx',
  'uber_eats',
  'just_eat_takeaway',
  'glovo',
] as const

export type StoreProvider = typeof storeProviders[number]
export type IntegrationOnboardingMode = 'dedicated' | 'oauth' | 'manual' | 'embedded' | 'partner_required' | 'coming_soon'
export type IntegrationOnboardingField = 'storeName' | 'storeUrl' | 'merchantId' | 'apiKey'

export interface IntegrationCatalogItem {
  value: StoreProvider
  label: string
  mode: IntegrationOnboardingMode
  fields: IntegrationOnboardingField[]
  directSettings?: string
}

export const integrationCatalog: IntegrationCatalogItem[] = [
  { value: 'woocommerce', label: 'WooCommerce', mode: 'dedicated', fields: [], directSettings: '/app/settings/integrations/woocommerce' },
  { value: 'shopify', label: 'Shopify', mode: 'oauth', fields: ['storeUrl'] },
  { value: 'opencart', label: 'OpenCart', mode: 'manual', fields: ['storeName', 'storeUrl', 'apiKey'] },
  { value: 'google_merchant', label: 'Google Merchant', mode: 'oauth', fields: ['merchantId'] },
  { value: 'whatsapp_business', label: 'WhatsApp Business', mode: 'embedded', fields: [] },
  { value: 'iss_pos', label: 'ISS POS', mode: 'partner_required', fields: [] },
  { value: 'ebay', label: 'eBay', mode: 'coming_soon', fields: [] },
  { value: 'amazon_marketplace', label: 'Amazon Marketplace', mode: 'coming_soon', fields: [] },
  { value: 'kleinanzeigen', label: 'Kleinanzeigen', mode: 'coming_soon', fields: [] },
  { value: 'olx', label: 'OLX', mode: 'coming_soon', fields: [] },
  { value: 'uber_eats', label: 'Uber Eats', mode: 'partner_required', fields: [] },
  { value: 'just_eat_takeaway', label: 'Just Eat / Takeaway / Lieferando', mode: 'partner_required', fields: [] },
  { value: 'glovo', label: 'Glovo', mode: 'partner_required', fields: [] },
]

export function getIntegrationCatalogItem(provider: StoreProvider) {
  return integrationCatalog.find((item) => item.value === provider) ?? integrationCatalog[0]
}

export function getIntegrationOnboardingDescriptionKey(
  provider: StoreProvider,
  mode: IntegrationOnboardingMode
) {
  if (provider === 'just_eat_takeaway') return 'integrationOnboarding.justEatDescription'
  if (mode === 'partner_required') return 'integrationOnboarding.partnerDescription'
  if (mode === 'coming_soon') return 'integrationOnboarding.comingSoonDescription'
  return `integrationOnboarding.${mode}`
}
