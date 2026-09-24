import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { shouldBlockOfflineSupabaseRequest } from './offline-fetch.ts'

const supabaseUrl = 'https://project.supabase.co'

test('blocks only offline Supabase business mutations', () => {
  for (const path of ['/rest/v1/expenses', '/storage/v1/object/private/file', '/functions/v1/action']) {
    assert.equal(shouldBlockOfflineSupabaseRequest({
      requestUrl: `${supabaseUrl}${path}`,
      method: 'POST',
      supabaseUrl,
      isOnline: false,
    }), true)
  }
})

test('does not interfere with reads, auth, external requests or online mutations', () => {
  assert.equal(shouldBlockOfflineSupabaseRequest({ requestUrl: `${supabaseUrl}/rest/v1/expenses`, method: 'GET', supabaseUrl, isOnline: false }), false)
  assert.equal(shouldBlockOfflineSupabaseRequest({ requestUrl: `${supabaseUrl}/auth/v1/logout`, method: 'POST', supabaseUrl, isOnline: false }), false)
  assert.equal(shouldBlockOfflineSupabaseRequest({ requestUrl: 'https://example.com/api', method: 'POST', supabaseUrl, isOnline: false }), false)
  assert.equal(shouldBlockOfflineSupabaseRequest({ requestUrl: `${supabaseUrl}/rest/v1/expenses`, method: 'DELETE', supabaseUrl, isOnline: true }), false)
})
