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
export type IntegrationSetupMethod =
  | 'platform_managed'
  | 'oauth'
  | 'api_credentials'
  | 'webhook_manual'
  | 'csv_file'
  | 'partner_approval'
  | 'unavailable'
export type IntegrationProviderState =
  | 'available'
  | 'connected'
  | 'configuration_required'
  | 'partner_required'
  | 'coming_soon'
  | 'error'

export interface IntegrationCatalogItem {
  value: StoreProvider
  label: string
  mode: IntegrationOnboardingMode
  setupMethod: IntegrationSetupMethod
  initialState: Exclude<IntegrationProviderState, 'connected' | 'error'>
  fields: IntegrationOnboardingField[]
  directSettings?: string
}

export const integrationCatalog: IntegrationCatalogItem[] = [
  { value: 'woocommerce', label: 'WooCommerce', mode: 'dedicated', setupMethod: 'api_credentials', initialState: 'available', fields: [], directSettings: '/app/settings/integrations/woocommerce' },
  { value: 'shopify', label: 'Shopify', mode: 'oauth', setupMethod: 'oauth', initialState: 'available', fields: ['storeUrl'] },
  { value: 'opencart', label: 'OpenCart', mode: 'manual', setupMethod: 'api_credentials', initialState: 'configuration_required', fields: ['storeName', 'storeUrl', 'apiKey'] },
  { value: 'google_merchant', label: 'Google Merchant', mode: 'oauth', setupMethod: 'oauth', initialState: 'available', fields: ['merchantId'] },
  { value: 'whatsapp_business', label: 'WhatsApp Business', mode: 'embedded', setupMethod: 'platform_managed', initialState: 'available', fields: [] },
  { value: 'iss_pos', label: 'ISS POS', mode: 'partner_required', setupMethod: 'partner_approval', initialState: 'partner_required', fields: [] },
  { value: 'ebay', label: 'eBay', mode: 'coming_soon', setupMethod: 'unavailable', initialState: 'coming_soon', fields: [] },
  { value: 'amazon_marketplace', label: 'Amazon Marketplace', mode: 'coming_soon', setupMethod: 'unavailable', initialState: 'coming_soon', fields: [] },
  { value: 'kleinanzeigen', label: 'Kleinanzeigen', mode: 'coming_soon', setupMethod: 'unavailable', initialState: 'coming_soon', fields: [] },
  { value: 'olx', label: 'OLX', mode: 'coming_soon', setupMethod: 'unavailable', initialState: 'coming_soon', fields: [] },
  { value: 'uber_eats', label: 'Uber Eats', mode: 'partner_required', setupMethod: 'partner_approval', initialState: 'partner_required', fields: [] },
  { value: 'just_eat_takeaway', label: 'Lieferando / Takeaway', mode: 'partner_required', setupMethod: 'partner_approval', initialState: 'partner_required', fields: [] },
  { value: 'glovo', label: 'Glovo', mode: 'partner_required', setupMethod: 'partner_approval', initialState: 'partner_required', fields: [] },
]

export function getIntegrationCatalogItem(provider: StoreProvider) {
  return integrationCatalog.find((item) => item.value === provider) ?? integrationCatalog[0]
}

export function getIntegrationProviderState(
  item: IntegrationCatalogItem,
  connectionStatus?: 'not_connected' | 'connected' | 'error' | 'disabled'
): IntegrationProviderState {
  if (connectionStatus === 'connected') return 'connected'
  if (connectionStatus === 'error') return 'error'
  return item.initialState
}

export function canStartIntegrationSetup(item: IntegrationCatalogItem) {
  return item.mode !== 'partner_required' && item.mode !== 'coming_soon'
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
