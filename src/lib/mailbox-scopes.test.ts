import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { hasRequiredMailboxScopes } from './mailbox/scopes.ts'

test('mailbox OAuth requires explicit provider scopes before persistence', () => {
  assert.equal(hasRequiredMailboxScopes('google', ['https://www.googleapis.com/auth/gmail.modify']), true)
  assert.equal(hasRequiredMailboxScopes('google', []), false)
  assert.equal(hasRequiredMailboxScopes('microsoft', ['openid', 'User.Read', 'Mail.ReadWrite', 'Mail.Send']), true)
  assert.equal(hasRequiredMailboxScopes('microsoft', ['User.Read', 'Mail.ReadWrite']), false)
})
