import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { createAssistantRateLimiter } from './assistant-rate-limit.ts'

test('limits each authenticated user independently and resets after the window', () => {
  const check = createAssistantRateLimiter({ windowMs: 1_000, maxRequests: 2 })
  assert.equal(check('user-a', 0), true)
  assert.equal(check('user-a', 1), true)
  assert.equal(check('user-a', 2), false)
  assert.equal(check('user-b', 2), true)
  assert.equal(check('user-a', 1_001), true)
})
