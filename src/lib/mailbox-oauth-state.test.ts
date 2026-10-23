import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isValidMailboxOAuthState } from './mailbox/oauth-state.ts'

const valid = {
  state: 'random-state', userId: 'user-1', companyId: 'workspace-1',
  provider: 'google' as const, expiresAt: 10_000,
}

test('OAuth callback state is bound to the returned state, provider and authenticated scope', () => {
  assert.equal(isValidMailboxOAuthState(valid, 'random-state', 'google', 9_999), true)
  assert.equal(isValidMailboxOAuthState(valid, 'wrong-state', 'google', 9_999), false)
  assert.equal(isValidMailboxOAuthState(valid, 'random-state', 'microsoft', 9_999), false)
  assert.equal(isValidMailboxOAuthState({ ...valid, userId: '' }, 'random-state', 'google', 9_999), false)
  assert.equal(isValidMailboxOAuthState({ ...valid, companyId: '' }, 'random-state', 'google', 9_999), false)
  assert.equal(isValidMailboxOAuthState(valid, 'random-state', 'google', 10_001), false)
})
