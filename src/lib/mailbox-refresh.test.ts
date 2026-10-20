import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { refreshMailView } from './mailbox/refresh.ts'

const connected = [
  { id: 'gmail-1', status: 'connected' },
  { id: 'outlook-1', status: 'connected' },
]

test('refresh reloads the selected mailbox and preserves its current folder/filter', async () => {
  const calls: unknown[] = []
  const view = { connectionId: 'outlook-1', folder: 'inbox' as const, filter: 'unread' as const }
  const result = await refreshMailView({ view, connections: connected, reloadMessages: async (current) => { calls.push(current) } })
  assert.deepEqual(calls, [view])
  assert.deepEqual(result.view, view)
})

test('All inboxes refresh passes the aggregated current folder and filter', async () => {
  const calls: unknown[] = []
  const view = { connectionId: 'all', folder: 'sent' as const, filter: 'all' as const }
  await refreshMailView({ view, connections: connected, reloadMessages: async (current) => { calls.push(current) } })
  assert.deepEqual(calls, [view])
})

test('refresh falls back to All inboxes when the selected mailbox is no longer connected', async () => {
  const calls: unknown[] = []
  const view = { connectionId: 'removed-mailbox', folder: 'inbox' as const, filter: 'all' as const }
  const result = await refreshMailView({
    view,
    connections: connected,
    reloadMessages: async (current) => { calls.push(current) },
  })
  assert.deepEqual(result.view, { ...view, connectionId: 'all' })
  assert.deepEqual(calls, [result.view])
})

test('refresh errors propagate for the client to show its controlled error while retaining data', async () => {
  await assert.rejects(refreshMailView({
    view: { connectionId: 'all', folder: 'inbox', filter: 'all' },
    connections: connected,
    reloadMessages: async () => { throw new Error('provider_unavailable') },
  }), /provider_unavailable/)
})

test('client prevents overlapping refreshes and preserves page data when a refresh message request fails', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/mail/mail-client.tsx'), 'utf8')
  assert.match(source, /if \(refreshInFlight\.current\) return/)
  assert.match(source, /refreshInFlight\.current = true/)
  assert.match(source, /if \(view\.connectionId !== currentView\.connectionId\) return Promise\.resolve\(\)/)
  assert.match(source, /preserveOnError\) setPage\(\{ messages: \[\], nextCursor: null \}\)/)
  assert.match(source, /setError\(connectionErrorKey\(caught\)\)[\s\S]*?setLoading\(false\)/)
})
