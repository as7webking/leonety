import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyMailboxConnectionFailure, firstMailboxTestFailure } from './mailbox/connection-diagnostics.ts'

test('mailbox connection errors map to safe diagnostics without exposing provider text', () => {
  assert.equal(classifyMailboxConnectionFailure({ code: 'EAUTH', message: 'secret must not be returned' }), 'authentication_rejected')
  assert.equal(classifyMailboxConnectionFailure({ code: 'EAUTH' }, 'imap'), 'imap_authentication_rejected')
  assert.equal(classifyMailboxConnectionFailure({ responseCode: 535 }, 'smtp'), 'smtp_authentication_rejected')
  assert.equal(classifyMailboxConnectionFailure({ code: 'ENOTFOUND', message: 'imap host' }), 'server_unreachable')
  assert.equal(classifyMailboxConnectionFailure({ code: 'ETIMEDOUT' }), 'connection_timeout')
  assert.equal(classifyMailboxConnectionFailure({ code: 'CERT_HAS_EXPIRED' }), 'tls_certificate_failure')
  assert.equal(classifyMailboxConnectionFailure({ code: 'EUNKNOWN' }), 'provider_unavailable')
})

test('IMAP and SMTP test outcomes retain which protocol failed', () => {
  assert.deepEqual(firstMailboxTestFailure({
    imap: { ok: true }, smtp: { ok: false, error: 'smtp_authentication_rejected' },
  }), { protocol: 'smtp', error: 'smtp_authentication_rejected' })
  assert.deepEqual(firstMailboxTestFailure({
    imap: { ok: false, error: 'connection_timeout' }, smtp: { ok: false, error: 'server_unreachable' },
  }), { protocol: 'imap', error: 'connection_timeout' })
  assert.equal(firstMailboxTestFailure({ imap: { ok: true }, smtp: { ok: true } }), null)
})
