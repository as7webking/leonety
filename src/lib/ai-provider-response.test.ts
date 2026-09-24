import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyAiProviderStatus, extractAiResponseText } from './ai-provider-response.ts'

test('classifies provider authentication, rate-limit and availability failures', () => {
  assert.equal(classifyAiProviderStatus(401), 'provider_auth_failed')
  assert.equal(classifyAiProviderStatus(403), 'provider_auth_failed')
  assert.equal(classifyAiProviderStatus(429), 'provider_rate_limited')
  assert.equal(classifyAiProviderStatus(500), 'provider_unavailable')
  assert.equal(classifyAiProviderStatus(503), 'provider_unavailable')
})

test('extracts valid Responses API text and rejects malformed output', () => {
  assert.equal(extractAiResponseText({ output_text: ' Hello ' }), 'Hello')
  assert.equal(extractAiResponseText({
    output: [{ content: [{ text: 'First' }, { text: 'Second' }] }],
  }), 'First\nSecond')
  assert.equal(extractAiResponseText({ output: [{ content: [{ text: 42 }] }] }), '')
  assert.equal(extractAiResponseText(null), '')
})
