import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getIntegrationCatalogItem, integrationCatalog } from './integration-catalog.ts'

const integrationsPage = readFileSync(new URL('../app/(app)/settings/integrations/page.tsx', import.meta.url), 'utf8')
const integrationRoute = readFileSync(new URL('../app/api/store-integrations/route.ts', import.meta.url), 'utf8')
const openCartTestRoute = readFileSync(new URL('../app/api/store-integrations/opencart/test/route.ts', import.meta.url), 'utf8')
const connectionPage = readFileSync(new URL('../app/(app)/settings/integrations/[connectionId]/page.tsx', import.meta.url), 'utf8')

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
