import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isAssistantRequestInCurrentScope, isRetryingLastUserMessage, parseAssistantChatCache, readScopedAssistantChatCache, serializeAssistantChatCache } from './assistant-chat-storage.ts'

const widgetSource = readFileSync(new URL('../components/ai-assistant-widget.tsx', import.meta.url), 'utf8')

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

test('same browser never presents another account cache under the current scope', () => {
  const keyA = 'leonety-assistant-chats:user-a:workspace-a'
  const keyB = 'leonety-assistant-chats:user-b:workspace-a'
  const storage = new Map([[keyA, serializeAssistantChatCache([validChat])]])
  const browserStorage = { getItem: (key: string) => storage.get(key) ?? null }
  assert.equal(readScopedAssistantChatCache(browserStorage, keyA)[0].messages[0].content, validChat.messages[0].content)
  assert.deepEqual(readScopedAssistantChatCache(browserStorage, keyB), [])
  assert.deepEqual(readScopedAssistantChatCache(browserStorage, null), [])
})

test('never imports unverifiable workspace-only legacy history', () => {
  assert.doesNotMatch(widgetSource, /legacyWorkspaceStorageKey/)
  assert.match(widgetSource, /readScopedAssistantChatCache\(window\.localStorage, storageKey\)/)
})

test('workspace/account changes immediately hide history and reject stale responses', () => {
  assert.match(widgetSource, /const visibleChats = scopeLoaded \? chats : \[\]/)
  assert.match(widgetSource, /const activeChat = scopeLoaded \?/)
  assert.equal(isAssistantRequestInCurrentScope('user-a:workspace-a', 'user-b:workspace-a', true), false)
  assert.equal(isAssistantRequestInCurrentScope('user-a:workspace-a', 'user-a:workspace-b', true), false)
  assert.equal(isAssistantRequestInCurrentScope('user-a:workspace-a', null, true), false)
  assert.equal(isAssistantRequestInCurrentScope('user-a:workspace-a', 'user-a:workspace-a', false), false)
  assert.equal(isAssistantRequestInCurrentScope('user-a:workspace-a', 'user-a:workspace-a', true), true)
})
