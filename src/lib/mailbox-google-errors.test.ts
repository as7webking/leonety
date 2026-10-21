import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { classifyGoogleApiFailure } from './mailbox/google-errors.ts'

test('Google mailbox errors distinguish expired auth, missing scope, rate limit and outage', () => {
  assert.equal(classifyGoogleApiFailure(401, null), 'reconnect_required')
  assert.equal(classifyGoogleApiFailure(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }), 'missing_scope')
  assert.equal(classifyGoogleApiFailure(403, { error: { message: 'policy denied' } }), 'provider_error')
  assert.equal(classifyGoogleApiFailure(429, null), 'rate_limited')
  assert.equal(classifyGoogleApiFailure(503, null), 'provider_unavailable')
})
