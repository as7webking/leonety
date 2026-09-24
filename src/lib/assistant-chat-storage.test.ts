import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isRetryingLastUserMessage, parseAssistantChatCache, serializeAssistantChatCache } from './assistant-chat-storage.ts'

const validChat = {
  id: 'chat-1',
  title: 'Invoices',
  messages: [{
    id: 'message-1',
    role: 'user' as const,
    content: 'How do I create an invoice?',
    createdAt: '2026-09-24T10:00:00.000Z',
  }],
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
}

test('rejects malformed local chat cache without crashing the assistant', () => {
  assert.deepEqual(parseAssistantChatCache('{broken'), [])
  assert.deepEqual(parseAssistantChatCache(JSON.stringify([{ id: 'unsafe' }])), [])
})

test('round-trips valid local chat history and limits retained messages', () => {
  const messages = Array.from({ length: 15 }, (_, index) => ({
    ...validChat.messages[0],
    id: `message-${index}`,
    content: `Message ${index}`,
  }))
  const parsed = parseAssistantChatCache(serializeAssistantChatCache([{ ...validChat, messages }]))
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].messages.length, 12)
  assert.equal(parsed[0].messages[0].content, 'Message 3')
})

test('retry reuses the failed user message instead of duplicating it', () => {
  assert.equal(isRetryingLastUserMessage(validChat.messages, 'How do I create an invoice?'), true)
  assert.equal(isRetryingLastUserMessage(validChat.messages, 'Where are invoices?'), false)
  assert.equal(isRetryingLastUserMessage([], 'Hello'), false)
})
