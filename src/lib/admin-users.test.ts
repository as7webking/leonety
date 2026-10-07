import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { escapePostgresLikePattern, getAdminUserStatus, getSafeAuthProvider, normalizeAdminUsersPage, normalizeAdminUsersPageSize, normalizeAdminUsersSearch } from './admin-user-directory.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { adminUsersDictionaries } from './admin-users-i18n.ts'

test('normalizes user-directory pagination and bounded search input', () => {
  assert.equal(normalizeAdminUsersPage('2'), 2)
  assert.equal(normalizeAdminUsersPage('-1'), 1)
  assert.equal(normalizeAdminUsersPageSize('1000'), 100)
  assert.equal(normalizeAdminUsersPageSize('invalid'), 25)
  assert.equal(normalizeAdminUsersSearch('  user   name  '), 'user name')
  assert.equal(normalizeAdminUsersSearch('x'.repeat(200)).length, 120)
  assert.equal(escapePostgresLikePattern('a%b_c\\d'), 'a\\%b\\_c\\\\d')
})

test('derives only safe account status and provider labels', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  assert.equal(getAdminUserStatus({ emailConfirmed: true, bannedUntil: null, now }), 'active')
  assert.equal(getAdminUserStatus({ emailConfirmed: false, bannedUntil: null, now }), 'unconfirmed')
  assert.equal(getAdminUserStatus({ emailConfirmed: true, bannedUntil: '2027-01-01T00:00:00.000Z', now }), 'deactivated')
  assert.equal(getSafeAuthProvider({ provider: 'google', providers: ['google'] }), 'google')
  assert.equal(getSafeAuthProvider({ access_token: 'secret' }), 'email')
})

test('protects the operator directory with server auth and exposes no mutation handler', () => {
  const apiSource = readFileSync(new URL('../app/api/admin/users/route.ts', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../app/(app)/admin/users/page.tsx', import.meta.url), 'utf8')
  const authorizationSource = readFileSync(new URL('./admin-authorization.ts', import.meta.url), 'utf8')

  assert.match(apiSource, /createServerSupabaseClient/)
  assert.match(apiSource, /supabase\.auth\.getUser\(\)/)
  assert.match(apiSource, /isLeonetyOperatorAdmin/)
  assert.match(apiSource, /auth\.admin\.listUsers/)
  assert.doesNotMatch(apiSource, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(apiSource, /user_metadata/)
  assert.doesNotMatch(apiSource, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(pageSource, /isLeonetyOperatorAdmin/)
  assert.match(pageSource, /redirect\('\/app\/dashboard'\)/)
  assert.match(authorizationSource, /\.from\('admin_accounts'\)/)
  assert.match(authorizationSource, /\.eq\('user_id', user\.id\)/)
})

test('provides complete admin user UI translations for every supported locale', () => {
  const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
  const englishKeys = Object.keys(adminUsersDictionaries.en)

  for (const locale of locales) {
    assert.deepEqual(Object.keys(adminUsersDictionaries[locale]).sort(), englishKeys.sort())
    for (const key of englishKeys) {
      assert.ok(adminUsersDictionaries[locale][key as keyof typeof adminUsersDictionaries.en])
    }
  }
})
