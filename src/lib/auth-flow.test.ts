import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getAuthCallbackUrl, getSafeAppRedirectPath } from './site-url.ts'

const loginSource = readFileSync(new URL('../app/(auth)/login/page.tsx', import.meta.url), 'utf8')
const callbackSource = readFileSync(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8')
const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
const serverClientSource = readFileSync(new URL('./supabase-server.ts', import.meta.url), 'utf8')
const profileSource = readFileSync(new URL('../app/(app)/profile/page.tsx', import.meta.url), 'utf8')

test('Google and Facebook use the existing Supabase OAuth flow without mailbox scopes', () => {
  assert.match(loginSource, /type OAuthProvider = 'google' \| 'facebook'/)
  assert.match(loginSource, /supabase\.auth\.signInWithOAuth\(\{\s*provider,/)
  assert.match(loginSource, /getAuthCallbackUrl\(getSafeAppRedirectPath/)
  assert.match(loginSource, /provider === 'google' \? \{ prompt: 'select_account' \} : undefined/)
  assert.doesNotMatch(loginSource, /gmail\.modify|gmail\.readonly|googleapis\.com\/auth\/gmail/)
})

test('OAuth callback exchanges PKCE code, creates only a missing profile, and scopes workspace to auth user', () => {
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/)
  assert.match(callbackSource, /\.eq\('id', user\.id\)/)
  assert.match(callbackSource, /if \(!existingProfile\)/)
  assert.match(callbackSource, /\.eq\('owner_id', user\.id\)/)
  assert.match(callbackSource, /auth_profile_failed/)
  assert.match(callbackSource, /auth_workspace_check_failed/)
  assert.doesNotMatch(callbackSource, /\.eq\('email', user\.email\)|\.update\(/)
  assert.match(callbackSource, /\(count \?\? 0\) > 0 \? next : '\/app\/onboarding'/)
  assert.match(serverClientSource, /createServerClient\([\s\S]*?cookies:\s*\{[\s\S]*?cookieStore\.set/)
})

test('OAuth callback preserves a safe intended app destination when returning an error to login', () => {
  assert.match(callbackSource, /getSafeAppRedirectPath\(requestUrl\.searchParams\.get\('next'\)\)/)
  assert.match(callbackSource, /if \(requestUrl\.searchParams\.has\('next'\)\) loginUrl\.searchParams\.set\('next', next\)/)
  assert.match(callbackSource, /session_exchange_failed/)
  assert.match(callbackSource, /auth_configuration_error/)
  assert.doesNotMatch(callbackSource, /console\.(?:warn|error)\([^\n]*exchangeError\.message/)
})

test('safe next path allows app routes and rejects external, protocol-relative and malformed destinations', () => {
  assert.equal(getSafeAppRedirectPath('/app/invoices?status=sent'), '/app/invoices?status=sent')
  assert.equal(getSafeAppRedirectPath('/app/transactions'), '/app/transactions')
  assert.equal(getSafeAppRedirectPath('https://attacker.example'), '/app/dashboard')
  assert.equal(getSafeAppRedirectPath('//attacker.example/path'), '/app/dashboard')
  assert.equal(getSafeAppRedirectPath('/\\\\attacker.example'), '/app/dashboard')
  assert.equal(getSafeAppRedirectPath('/pricing'), '/app/dashboard')
})

test('callback URL is Leonety /auth/callback with a separately encoded safe next path', () => {
  const callback = new URL(getAuthCallbackUrl('/app/invoices?status=sent'))
  assert.equal(callback.pathname, '/auth/callback')
  assert.equal(callback.searchParams.get('next'), '/app/invoices?status=sent')
  assert.equal(new URL(getAuthCallbackUrl('https://attacker.example')).searchParams.get('next'), '/app/profile')
})

test('provider denial, callback exchange, profile, workspace, onboarding and existing workspace paths remain distinct', () => {
  assert.match(callbackSource, /providerError === 'access_denied' \|\| providerErrorCode === 'user_cancelled'/)
  assert.match(callbackSource, /wasDenied \? 'auth_provider_denied' : 'auth_provider_error'/)
  assert.match(callbackSource, /if \(exchangeError\)[\s\S]*?session_exchange_failed/)
  assert.match(callbackSource, /if \(profileLookupError\)[\s\S]*?auth_profile_failed/)
  assert.match(callbackSource, /if \(companyLookupError\)[\s\S]*?auth_workspace_check_failed/)
  assert.match(callbackSource, /if \(!existingProfile\)[\s\S]*?profiles'\)\.insert/)
  assert.match(callbackSource, /\(count \?\? 0\) > 0 \? next : '\/app\/onboarding'/)
  assert.doesNotMatch(callbackSource, /access_token|refresh_token|authorization code.*console\.(?:log|error)/i)
})

test('authenticated back navigation cannot hide callback errors or reveal app through login', () => {
  assert.match(proxySource, /pathname === '\/login' && !request\.nextUrl\.searchParams\.has\('error'\)/)
  assert.match(proxySource, /if \(!user && isProtectedRoute\)/)
})

test('logout terminates the Supabase session before navigating back to login', () => {
  assert.match(profileSource, /supabase\.auth\.signOut\(\)/)
  assert.match(profileSource, /router\.replace\('\/login'\)/)
  assert.match(proxySource, /supabase\.auth\.getUser\(\)/)
})
