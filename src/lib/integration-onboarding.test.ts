import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { canStartIntegrationSetup, getIntegrationCatalogItem, getIntegrationProviderState, integrationCatalog } from './integration-catalog.ts'

const integrationsPage = readFileSync(new URL('../app/(app)/settings/integrations/page.tsx', import.meta.url), 'utf8')
const integrationRoute = readFileSync(new URL('../app/api/store-integrations/route.ts', import.meta.url), 'utf8')
const openCartTestRoute = readFileSync(new URL('../app/api/store-integrations/opencart/test/route.ts', import.meta.url), 'utf8')
const connectionPage = readFileSync(new URL('../app/(app)/settings/integrations/[connectionId]/page.tsx', import.meta.url), 'utf8')
const wooSettingsPage = readFileSync(new URL('../app/(app)/settings/integrations/woocommerce/page.tsx', import.meta.url), 'utf8')
const wooConnectionRoute = readFileSync(new URL('../app/api/woocommerce/connection/route.ts', import.meta.url), 'utf8')

test('classifies every listed provider with an explicit onboarding mode', () => {
  assert.equal(integrationCatalog.length, 13)
  assert.equal(getIntegrationCatalogItem('woocommerce').mode, 'dedicated')
  assert.equal(getIntegrationCatalogItem('shopify').mode, 'oauth')
  assert.equal(getIntegrationCatalogItem('google_merchant').mode, 'oauth')
  assert.equal(getIntegrationCatalogItem('opencart').mode, 'manual')
  assert.equal(getIntegrationCatalogItem('whatsapp_business').mode, 'embedded')
  assert.equal(getIntegrationCatalogItem('just_eat_takeaway').mode, 'partner_required')
  assert.equal(getIntegrationCatalogItem('ebay').mode, 'coming_soon')
})

test('separates provider availability from its setup method', () => {
  assert.equal(getIntegrationCatalogItem('woocommerce').setupMethod, 'api_credentials')
  assert.equal(getIntegrationCatalogItem('shopify').setupMethod, 'oauth')
  assert.equal(getIntegrationCatalogItem('whatsapp_business').setupMethod, 'platform_managed')
  assert.equal(getIntegrationCatalogItem('opencart').initialState, 'configuration_required')
  assert.equal(getIntegrationProviderState(getIntegrationCatalogItem('shopify')), 'available')
  assert.equal(getIntegrationProviderState(getIntegrationCatalogItem('shopify'), 'connected'), 'connected')
  assert.equal(getIntegrationProviderState(getIntegrationCatalogItem('shopify'), 'error'), 'error')
})

test('keeps Lieferando partner-gated without a fake connection flow', () => {
  const provider = getIntegrationCatalogItem('just_eat_takeaway')

  assert.equal(provider.label, 'Lieferando / Takeaway')
  assert.equal(provider.setupMethod, 'partner_approval')
  assert.equal(provider.initialState, 'partner_required')
  assert.deepEqual(provider.fields, [])
  assert.equal(canStartIntegrationSetup(provider), false)
  assert.equal(getIntegrationProviderState(provider), 'partner_required')
})

test('preserves the dedicated WooCommerce onboarding route', () => {
  const provider = getIntegrationCatalogItem('woocommerce')

  assert.equal(provider.mode, 'dedicated')
  assert.equal(provider.directSettings, '/app/settings/integrations/woocommerce')
  assert.equal(canStartIntegrationSetup(provider), true)
})

test('legacy WooCommerce credentials are not presented as a verified connection', () => {
  assert.match(integrationRoute, /status: 'unverified'/)
  assert.match(integrationRoute, /errorMessage: sanitizeIntegrationErrorMessage\(row\.error_message\)/)
  assert.match(integrationRoute, /lastError: sanitizeIntegrationErrorMessage/)
  assert.match(integrationRoute, /metadata: \{[\s\S]*clientCreationMode[\s\S]*displayPhoneNumber/)
  assert.doesNotMatch(integrationRoute, /metadata: row\.metadata \?\? null/)
  assert.equal(getIntegrationProviderState(getIntegrationCatalogItem('woocommerce'), 'unverified'), 'unverified')
})

test('WooCommerce distinguishes saved credentials from a successful test without exposing credentials', () => {
  assert.match(wooConnectionRoute, /configured: Boolean\(row\?\.active\)/)
  assert.match(wooConnectionRoute, /verified: false/)
  assert.match(wooSettingsPage, /status\.configured \? \(status\.verified \? t\('woocommerce\.connected'\)/)
  assert.match(wooSettingsPage, /setStatus\(\(previous\) => \(\{ \.\.\.previous, verified: true \}\)\)/)
  assert.match(wooSettingsPage, /<ConfirmDialog/)
  assert.doesNotMatch(wooConnectionRoute, /consumerKey:\s*row\.consumer_key|consumerSecret:\s*row\.consumer_secret/)
})

test('disconnect requires accessible confirmation on both integration screens', () => {
  for (const source of [integrationsPage, connectionPage]) {
    assert.match(source, /<ConfirmDialog/)
    assert.match(source, /disconnectConfirm:/)
    assert.match(source, /onCancel=\{\(\) => setConfirmDisconnectOpen\(false\)\}/)
  }
})

test('integration pages clear prior workspace state and ignore stale responses', () => {
  for (const source of [integrationsPage, connectionPage]) {
    assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*displayedWorkspaceIdRef/)
    assert.match(source, /currentWorkspaceIdRef\.current !== currentCompany\.id/)
    assert.match(source, /integrationRequestRef\.current\?\.abort\(\)|connectionRequestRef\.current\?\.abort\(\)/)
  }
})

test('exposes only provider-specific onboarding fields', () => {
  assert.deepEqual(getIntegrationCatalogItem('opencart').fields, ['storeName', 'storeUrl', 'apiKey'])
  assert.deepEqual(getIntegrationCatalogItem('shopify').fields, ['storeUrl'])
  assert.deepEqual(getIntegrationCatalogItem('google_merchant').fields, ['merchantId'])

  for (const provider of integrationCatalog) {
    assert.equal(provider.fields.includes('accessToken' as never), false)
    assert.equal(provider.fields.includes('refreshToken' as never), false)
    assert.equal(provider.fields.includes('apiSecret' as never), false)
  }
})

test('generic endpoint accepts only the implemented OpenCart manual flow', () => {
  assert.match(integrationRoute, /if \(provider !== 'opencart'\)/)
  assert.doesNotMatch(integrationRoute, /body\.accessToken/)
  assert.doesNotMatch(integrationRoute, /body\.refreshToken/)
  assert.doesNotMatch(integrationRoute, /body\.apiSecret/)
})

test('ordinary onboarding UI does not render plaintext token inputs', () => {
  assert.doesNotMatch(integrationsPage, /updateForm\('accessToken'/)
  assert.doesNotMatch(integrationsPage, /updateForm\('refreshToken'/)
  assert.doesNotMatch(integrationsPage, /updateForm\('apiSecret'/)
  assert.doesNotMatch(connectionPage, /connection\.accessTokenPreview\]/)
  assert.doesNotMatch(connectionPage, /connection\.refreshTokenPreview\]/)
  assert.doesNotMatch(connectionPage, /connection\.apiSecretPreview\]/)
  assert.doesNotMatch(integrationsPage, /apiKey: form\.apiKey \|\| currentIntegration\?\.apiKeyPreview/)
  assert.match(openCartTestRoute, /decryptSecret\(saved\?\.api_key\)/)
})

test('partner-gated cards show requirements instead of a connection action', () => {
  assert.match(integrationsPage, /canStartIntegrationSetup/)
  assert.match(integrationsPage, /integrationOnboarding\.viewRequirements/)
  assert.doesNotMatch(integrationsPage, /selectedProvider\.mode === 'partner_required'[\s\S]*integrationOnboarding\.connect/)
})

test('onboarding cards and status controls stay shrinkable on narrow screens', () => {
  assert.match(integrationsPage, /grid min-w-0 grid-cols-1/)
  assert.match(integrationsPage, /flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0/)
  assert.match(integrationsPage, /inline-flex w-fit max-w-full items-center/)
  assert.match(integrationsPage, /flex min-w-0 flex-col gap-3 sm:flex-row/)
})
