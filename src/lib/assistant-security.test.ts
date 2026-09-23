import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const routeSource = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')
const dataSource = readFileSync(new URL('./assistant-data-server.ts', import.meta.url), 'utf8')

test('derives user identity from the authenticated session rather than request JSON', () => {
  const requestSchema = routeSource.slice(
    routeSource.indexOf('const requestSchema'),
    routeSource.indexOf('const RATE_LIMIT_WINDOW_MS')
  )
  assert.doesNotMatch(requestSchema, /user_?id/i)
  assert.match(routeSource, /userId:\s*authData\.user\.id/)
})

test('authorizes the requested workspace by both id and authenticated owner', () => {
  assert.match(dataSource, /\.eq\('id', companyId\)[\s\S]*\.eq\('owner_id', userId\)/)
  assert.match(dataSource, /\.eq\('company_id', workspace\.id\)/)
})

test('keeps assistant data access read-only and excludes secret or employee sources', () => {
  assert.doesNotMatch(dataSource, /\.from\('(profiles|employees|employee_documents|store_integrations|woocommerce_connections)'\)/)
  assert.doesNotMatch(dataSource, /\.(insert|update|upsert|delete)\(/)
  assert.doesNotMatch(dataSource, /\.select\(['"]\*['"]\)/)
  assert.doesNotMatch(dataSource, /service[_-]?role|supabase-admin|runSQL/i)
})
