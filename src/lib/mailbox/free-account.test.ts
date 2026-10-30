import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getVerifiedCanonicalAuthEmail, mailboxEmailMatchesCanonical, mailboxEmailsMatch } from './free-account.ts'

test('canonical account email requires a verified Supabase auth identity', () => {
  assert.equal(getVerifiedCanonicalAuthEmail({ email: 'Admin@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }), 'admin@example.com')
  assert.equal(getVerifiedCanonicalAuthEmail({ email: 'admin@example.com', email_confirmed_at: null }), null)
  assert.equal(mailboxEmailMatchesCanonical({ email: 'admin@example.com' }, 'admin@example.com'), false)
})

test('account mailbox mode compares the authorized address to the canonical address only', () => {
  const identity = { email: 'Admin@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
  assert.equal(mailboxEmailMatchesCanonical(identity, ' admin@example.com '), true)
  assert.equal(mailboxEmailMatchesCanonical(identity, 'other@example.com'), false)
  assert.equal(mailboxEmailsMatch('Admin@Example.com', 'admin@example.com'), true)
})
