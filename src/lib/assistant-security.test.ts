import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const dataSource = readFileSync(new URL('./assistant-data-server.ts', import.meta.url), 'utf8')
const requestSource = readFileSync(new URL('./assistant-request.ts', import.meta.url), 'utf8')

test('derives user identity from the authenticated session rather than request JSON', () => {
  assert.doesNotMatch(requestSource, /user_?id/i)
  assert.match(routeSource, /if \(authError \|\| !authData\.user\)[\s\S]*status: 401/)
  assert.match(routeSource, /userId:\s*authData\.user\.id/)
})

test('unsupported facts and all live data requests are handled before any OpenAI request', () => {
  const unsupportedGate = routeSource.indexOf("if (capability.kind === 'unsupported')")
  const dataGate = routeSource.indexOf("if (capability.kind === 'data')")
  const providerCall = routeSource.indexOf('generateAiText(')
  assert.ok(unsupportedGate >= 0 && dataGate > unsupportedGate)
  assert.ok(providerCall > dataGate)
  assert.match(routeSource, /if \(failed\)[\s\S]*status: 503/)
  assert.match(routeSource, /authorizedReadOnlyData: \[\]/)
})

test('authorizes the requested workspace by both id and authenticated owner', () => {
  assert.match(dataSource, /\.eq\('id', companyId\)[\s\S]*\.eq\('owner_id', userId\)/)
  assert.match(dataSource, /if \(!data\) throw new AssistantWorkspaceAccessError\('workspace_access_denied'\)/)
  assert.match(dataSource, /\.eq\('company_id', companyId\)/)
})

test('keeps assistant data access read-only and excludes secret or employee sources', () => {
  assert.doesNotMatch(dataSource, /\.from\('(profiles|employees|employee_documents)'\)/)
  assert.match(dataSource, /\.from\('store_integrations'\)\.select\('status'\)/)
  assert.match(dataSource, /\.from\('woocommerce_connections'\)\.select\('active'\)/)
  assert.doesNotMatch(dataSource, /\.select\(['"][^'"]*(consumer_key|consumer_secret|api_secret|access_token|refresh_token|credentials)[^'"]*['"]\)/i)
  assert.doesNotMatch(dataSource, /\.(insert|update|upsert|delete)\(/)
  assert.doesNotMatch(dataSource, /\.select\(['"]\*['"]\)/)
  assert.match(dataSource, /authorizeWorkspace\(supabase, userId, companyId\)/)
  assert.match(dataSource, /createSupabaseAdminClient/)
  assert.match(dataSource, /resolveAccountAccessForUser\(userId, email, \{ readOnly: true \}\)/)
  assert.match(readFileSync(new URL('./account-access-server.ts', import.meta.url), 'utf8'), /if \(!options\.readOnly && isConfiguredAdmin/)
})
