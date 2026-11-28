import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { verifyBillingWebhookSignature } from './billing/webhook-security.ts'

const checkoutSource = readFileSync(new URL('../app/api/billing/checkout/route.ts', import.meta.url), 'utf8')
const cancellationSource = readFileSync(new URL('../app/api/billing/subscription/cancel/route.ts', import.meta.url), 'utf8')
const webhookSource = readFileSync(new URL('./billing/webhook-handler.ts', import.meta.url), 'utf8')
const billingMigration = readFileSync(new URL('../../supabase/migrations/20260919205522.sql', import.meta.url), 'utf8')

function signature(provider: 'stripe' | 'paddle', body: string, secret: string, timestamp: number) {
  const payload = provider === 'stripe' ? `${timestamp}.${body}` : `${timestamp}:${body}`
  const digest = createHmac('sha256', secret).update(payload).digest('hex')
  return provider === 'stripe' ? `t=${timestamp},v1=${digest}` : `ts=${timestamp};h1=${digest}`
}

test('verifies exact raw-body signatures for Stripe and Paddle within the replay window', () => {
  const body = JSON.stringify({ event_id: 'evt_test_1', data: { status: 'active' } })
  const secret = 'test-only-webhook-secret'
  const now = 1_800_000_000

  for (const provider of ['stripe', 'paddle'] as const) {
    const header = signature(provider, body, secret, now)
    assert.equal(verifyBillingWebhookSignature(provider, body, header, secret, now), true)
    assert.equal(verifyBillingWebhookSignature(provider, `${body} `, header, secret, now), false)
    assert.equal(verifyBillingWebhookSignature(provider, body, header, 'different-secret', now), false)
    assert.equal(verifyBillingWebhookSignature(provider, body, header, secret, now + 301), false)
  }
})

test('rejects missing, malformed, and stale billing signatures', () => {
  const now = 1_800_000_000
  assert.equal(verifyBillingWebhookSignature('paddle', '{}', null, 'secret', now), false)
  assert.equal(verifyBillingWebhookSignature('stripe', '{}', 'v1=bad', 'secret', now), false)
  assert.equal(verifyBillingWebhookSignature('paddle', '{}', 'ts=not-a-time;h1=bad', 'secret', now), false)
  assert.equal(verifyBillingWebhookSignature('stripe', '{}', signature('stripe', '{}', 'secret', now - 301), 'secret', now), false)
})

test('keeps checkout tied to the authenticated workspace owner and server-selected plan/provider', () => {
  assert.match(checkoutSource, /supabase\.auth\.getUser\(\)/)
  assert.match(checkoutSource, /company\.owner_id !== authData\.user\.id/)
  assert.match(checkoutSource, /getConfiguredBillingProvider\(\)/)
  assert.match(checkoutSource, /getProviderPriceId\(provider, plan\)/)
  assert.match(checkoutSource, /company_id: companyId[\s\S]*user_id: userId[\s\S]*plan/)
  assert.doesNotMatch(checkoutSource, /body\?\.provider\s*\?\?/)
})

test('requires successful workspace-scoped cancellation persistence before returning success', () => {
  assert.match(cancellationSource, /\.eq\('company_id', companyId\)/)
  assert.match(cancellationSource, /if \(persistenceError \|\| !persistedSubscription\)/)
  assert.ok(cancellationSource.indexOf('if (persistenceError || !persistedSubscription)') < cancellationSource.indexOf('return NextResponse.json({ ok: true'))
})

test('persists webhook event completion and uses stable identities for retries and subscription upserts', () => {
  assert.match(webhookSource, /if \(error\) throw error\s+if \(!data\) throw new Error\('Billing event processing state could not be persisted'\)/)
  assert.match(webhookSource, /if \(error\.code === '23505'\)/)
  assert.match(webhookSource, /duplicate_processed/)
  assert.match(webhookSource, /onConflict: 'provider,provider_subscription_id'/)
  assert.match(billingMigration, /unique \(provider, provider_event_id\)/)
  assert.match(billingMigration, /unique \(provider, provider_subscription_id\)/)
})
