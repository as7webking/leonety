import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyAiProviderStatus, extractAiResponseText, shouldRetryAiProviderError } from './ai-provider-response.ts'

test('classifies provider authentication, rate-limit and availability failures', () => {
  assert.equal(classifyAiProviderStatus(401), 'provider_auth_failed')
  assert.equal(classifyAiProviderStatus(403), 'provider_auth_failed')
  assert.equal(classifyAiProviderStatus(429), 'rate_limited')
  assert.equal(classifyAiProviderStatus(429, {
    error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' },
  }), 'quota_exhausted')
  assert.equal(classifyAiProviderStatus(404, {
    error: { code: 'model_not_found', param: 'model' },
  }), 'invalid_model')
  assert.equal(classifyAiProviderStatus(408), 'request_timeout')
  assert.equal(classifyAiProviderStatus(500), 'provider_unavailable')
  assert.equal(classifyAiProviderStatus(503), 'provider_unavailable')
})

test('retries only the first transient provider-unavailable failure', () => {
  assert.equal(shouldRetryAiProviderError('provider_unavailable', 0), true)
  assert.equal(shouldRetryAiProviderError('provider_unavailable', 1), false)
  assert.equal(shouldRetryAiProviderError('rate_limited', 0), false)
  assert.equal(shouldRetryAiProviderError('quota_exhausted', 0), false)
  assert.equal(shouldRetryAiProviderError('provider_auth_failed', 0), false)
  assert.equal(shouldRetryAiProviderError('invalid_model', 0), false)
})

test('extracts valid Responses API text and rejects malformed output', () => {
  assert.equal(extractAiResponseText({ output_text: ' Hello ' }), 'Hello')
  assert.equal(extractAiResponseText({
    output: [{ content: [{ text: 'First' }, { text: 'Second' }] }],
  }), 'First\nSecond')
  assert.equal(extractAiResponseText({ output: [{ content: [{ text: 42 }] }] }), '')
  assert.equal(extractAiResponseText(null), '')
})
