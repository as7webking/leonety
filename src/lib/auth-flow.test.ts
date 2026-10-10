import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const loginSource = readFileSync(new URL('../app/(auth)/login/page.tsx', import.meta.url), 'utf8')
const callbackSource = readFileSync(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8')
const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')

test('Google and Facebook use the existing Supabase OAuth flow without mailbox scopes', () => {
  assert.match(loginSource, /type OAuthProvider = 'google' \| 'facebook'/)
  assert.match(loginSource, /supabase\.auth\.signInWithOAuth\(\{\s*provider,/)
  assert.match(loginSource, /getAuthCallbackUrl\(getSafeAppRedirectPath/)
  assert.doesNotMatch(loginSource, /gmail\.modify|gmail\.readonly|googleapis\.com\/auth\/gmail/)
})

test('OAuth callback exchanges PKCE code, creates only a missing profile, and scopes workspace to auth user', () => {
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/)
  assert.match(callbackSource, /\.eq\('id', user\.id\)/)
  assert.match(callbackSource, /if \(!existingProfile\)/)
  assert.match(callbackSource, /\.eq\('owner_id', user\.id\)/)
  assert.match(callbackSource, /auth_profile_failed/)
  assert.match(callbackSource, /auth_workspace_check_failed/)
})

test('authenticated back navigation cannot hide callback errors or reveal app through login', () => {
  assert.match(proxySource, /pathname === '\/login' && !request\.nextUrl\.searchParams\.has\('error'\)/)
  assert.match(proxySource, /if \(!user && isProtectedRoute\)/)
})
