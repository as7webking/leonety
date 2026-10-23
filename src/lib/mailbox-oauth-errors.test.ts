import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyOAuthFailure } from './mailbox/oauth-errors.ts'

test('Gmail OAuth errors distinguish expiration, missing permissions and provider failures', () => {
  assert.equal(classifyOAuthFailure(400, 'invalid_grant'), 'authorization_expired')
  assert.equal(classifyOAuthFailure(401, 'invalid_token'), 'authorization_expired')
  assert.equal(classifyOAuthFailure(400, 'invalid_scope'), 'missing_scope')
  assert.equal(classifyOAuthFailure(429), 'rate_limited')
  assert.equal(classifyOAuthFailure(503), 'provider_unavailable')
  assert.equal(classifyOAuthFailure(400, 'invalid_request'), 'mailbox_oauth_failed')
})
