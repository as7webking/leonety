import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { mailRouteHref, parseMailRoute } from './mailbox/navigation.ts'

test('mail message URLs preserve mailbox, provider, message, folder, and list state', () => {
  const route = {
    mailboxId: 'connection-1',
    folder: 'inbox' as const,
    filter: 'unread' as const,
    message: {
      connectionId: 'connection-1',
      provider: 'google' as const,
      messageId: 'id/with?reserved&chars',
      folder: 'inbox' as const,
    },
  }
  assert.deepEqual(parseMailRoute(mailRouteHref(route).split('?')[1]), route)
})

test('invalid provider or incomplete message identity is not opened as a message', () => {
  assert.equal(parseMailRoute('?provider=unknown&messageConnection=c&messageId=m').message, null)
  assert.equal(parseMailRoute('?provider=google&messageConnection=c').message, null)
})

test('sent routes do not retain an inbox-only unread filter', () => {
  assert.deepEqual(parseMailRoute('?folder=sent&filter=unread').filter, 'all')
})
