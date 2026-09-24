import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { ASSISTANT_MAX_RESPONSE_LENGTH, ASSISTANT_MAX_USER_MESSAGE_LENGTH, assistantRequestSchema, normalizeAssistantMessagesForRequest } from './assistant-request.ts'

const baseRequest = {
  locale: 'en',
  pathname: '/app/dashboard',
  companyId: null,
}

test('accepts provider responses that are longer than the user input limit', () => {
  const parsed = assistantRequestSchema.safeParse({
    ...baseRequest,
    messages: [
      { role: 'user', content: 'How do I create an invoice?' },
      { role: 'assistant', content: 'A'.repeat(ASSISTANT_MAX_USER_MESSAGE_LENGTH + 1) },
      { role: 'user', content: 'What comes next?' },
    ],
  })

  assert.equal(parsed.success, true)
})

test('keeps strict limits for browser-provided user messages and provider history', () => {
  const longUserMessage = assistantRequestSchema.safeParse({
    ...baseRequest,
    messages: [{ role: 'user', content: 'A'.repeat(ASSISTANT_MAX_USER_MESSAGE_LENGTH + 1) }],
  })
  const oversizedProviderMessage = assistantRequestSchema.safeParse({
    ...baseRequest,
    messages: [{ role: 'assistant', content: 'A'.repeat(ASSISTANT_MAX_RESPONSE_LENGTH + 1) }],
  })

  assert.equal(longUserMessage.success, false)
  assert.equal(oversizedProviderMessage.success, false)
})

test('normalizes legacy chat history before sending it to the API', () => {
  const messages = normalizeAssistantMessagesForRequest([
    { role: 'user', content: 'U'.repeat(ASSISTANT_MAX_USER_MESSAGE_LENGTH + 20) },
    { role: 'assistant', content: 'A'.repeat(ASSISTANT_MAX_RESPONSE_LENGTH + 20) },
  ])

  assert.equal(messages[0].content.length, ASSISTANT_MAX_USER_MESSAGE_LENGTH)
  assert.equal(messages[1].content.length, ASSISTANT_MAX_RESPONSE_LENGTH)
  assert.equal(assistantRequestSchema.safeParse({ ...baseRequest, messages }).success, true)
})
