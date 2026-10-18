import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

test('Gmail, Microsoft and IMAP routes preserve provider-aware message identity and folder', () => {
  for (const provider of ['google', 'microsoft', 'imap'] as const) {
    for (const folder of ['inbox', 'sent'] as const) {
      const route = {
        mailboxId: 'all',
        folder,
        filter: folder === 'inbox' ? 'unread' as const : 'all' as const,
        message: {
          connectionId: 'c91f5e10-b7b3-4dd4-bd87-e90e580b7d40',
          provider,
          messageId: provider === 'imap' ? 'Sent Items/2831' : 'id/with?reserved&chars',
          folder,
        },
      }
      const href = mailRouteHref(route)
      assert.match(href, /\/app\/mail\?/)
      assert.deepEqual(parseMailRoute(href.split('?')[1]), route)
      assert.doesNotMatch(href, /access_token|refresh_token|credential/i)
    }
  }
})

test('desktop and mobile navigation each render one Mail destination from shared navigation data', () => {
  const file = resolve(process.cwd(), 'src/components/app-shell/navigation-items.ts')
  const source = readFileSync(file, 'utf8')
  assert.equal([...source.matchAll(/href:\s*'\/app\/mail'/g)].length, 1)
})

test('mail view distinguishes failed loads from a truly empty inbox and retains mailbox statuses', () => {
  const file = resolve(process.cwd(), 'src/components/mail/mail-client.tsx')
  const source = readFileSync(file, 'utf8')
  assert.match(source, /!loading && !error && !page\.failedMailboxCount && !page\.messages\.length/)
  assert.match(source, /connections\.filter\(\(item\) => item\.status === 'connected'\)/)
  assert.match(source, /setError\(connectionErrorKey\(caught\)\)[\s\S]*?setLoading\(false\)/)
  assert.match(source, /function connectionErrorKey\([\s\S]*mail\.error\.mailbox_load_failed/)
  assert.match(source, /function errorKey\([\s\S]*provider_error[\s\S]*mailbox_provider_error/)
  assert.match(source, /connections\.map\(\(item\) => <li key=\{item\.id\}[\s\S]*providerName\(item\.provider\)/)
  assert.ok(source.includes('disabled={Boolean(replyingTo)}'))
})
