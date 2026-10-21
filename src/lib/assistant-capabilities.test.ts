import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { resolveAssistantCapability } from './assistant-capabilities.ts'

test('retrieves fresh exact product, plan, and WooCommerce facts', () => {
  assert.deepEqual(resolveAssistantCapability([{ role: 'user', content: 'How many products do I have exactly?' }]), {
    kind: 'data', tools: ['product_count'], sourceMessage: 'How many products do I have exactly?',
  })
  assert.deepEqual(resolveAssistantCapability([{ role: 'user', content: 'What is my current plan?' }]), {
    kind: 'data', tools: ['account_plan'], sourceMessage: 'What is my current plan?',
  })
  assert.deepEqual(resolveAssistantCapability([{ role: 'user', content: 'And WooCommerce?' }]), {
    kind: 'data', tools: ['woocommerce_status'], sourceMessage: 'And WooCommerce?',
  })
})

test('unsupported live financial facts fail closed instead of reaching the model', () => {
  for (const prompt of ['What is my current balance?', 'How much profit did I make?', 'What is my Kassenbuch balance?']) {
    assert.equal(resolveAssistantCapability([{ role: 'user', content: prompt }]).kind, 'unsupported')
  }
  assert.equal(resolveAssistantCapability([{ role: 'user', content: 'How many clients do I have?' }]).kind, 'unsupported')
  assert.equal(resolveAssistantCapability([{ role: 'user', content: 'How much income did I have last month?' }]).kind, 'unsupported')
  assert.equal(resolveAssistantCapability([{ role: 'user', content: 'Show all invoices' }]).kind, 'unsupported')
  assert.equal(resolveAssistantCapability([{ role: 'user', content: 'List transactions' }]).kind, 'unsupported')
})

test('factual follow-ups reclassify using user questions only and retrieve again', () => {
  const decision = resolveAssistantCapability([
    { role: 'user', content: 'How many products do I have?' },
    { role: 'assistant', content: 'You have 999 products.' },
    { role: 'user', content: 'Is that correct?' },
  ])
  assert.deepEqual(decision, { kind: 'data', tools: ['product_count'], sourceMessage: 'How many products do I have?' })
})

test('follow-ups do not turn unsupported periods into supported current-period facts', () => {
  const decision = resolveAssistantCapability([
    { role: 'user', content: 'How much income did I have last month?' },
    { role: 'assistant', content: 'Your income was 42,000 EUR.' },
    { role: 'user', content: 'Is that correct?' },
  ])
  assert.deepEqual(decision, {
    kind: 'unsupported', reason: 'live_data', sourceMessage: 'How much income did I have last month?',
  })
})

test('unverified feature questions do not produce invented Leonety routes', () => {
  const decision = resolveAssistantCapability([{ role: 'user', content: 'Does Leonety have a moon dashboard?' }])
  assert.deepEqual(decision, { kind: 'unsupported', reason: 'feature', sourceMessage: 'Does Leonety have a moon dashboard?' })
})
