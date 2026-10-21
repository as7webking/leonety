import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyMailboxConnectionFailure } from './mailbox/connection-diagnostics.ts'

test('mailbox connection errors map to safe diagnostics without exposing provider text', () => {
  assert.equal(classifyMailboxConnectionFailure({ code: 'EAUTH', message: 'secret must not be returned' }), 'authentication_rejected')
  assert.equal(classifyMailboxConnectionFailure({ code: 'ENOTFOUND', message: 'imap host' }), 'server_unreachable')
  assert.equal(classifyMailboxConnectionFailure({ code: 'ETIMEDOUT' }), 'connection_timeout')
  assert.equal(classifyMailboxConnectionFailure({ code: 'CERT_HAS_EXPIRED' }), 'tls_certificate_failure')
  assert.equal(classifyMailboxConnectionFailure({ code: 'EUNKNOWN' }), 'provider_unavailable')
})
