import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const clientsPage = readFileSync(new URL('../app/(app)/clients/page.tsx', import.meta.url), 'utf8')

test('clients use one URL-backed all, active and inactive filter model', () => {
  assert.match(clientsPage, /normalizeClientStatusFilter\(searchParams\.get\('status'\)\)/)
  assert.match(clientsPage, /router\.replace\(queryString \? `\/app\/clients\?\$\{queryString\}` : '\/app\/clients'/)
  assert.match(clientsPage, /\(\['all', 'active', 'inactive'\] as const\)/)
})

test('all view renders active and inactive groups without changing client status semantics', () => {
  assert.match(clientsPage, /activeClients\.map/)
  assert.match(clientsPage, /inactiveClients\.map/)
  assert.match(clientsPage, /client\.status === 'inactive'/)
  assert.match(clientsPage, /clients\.crm\.inactiveSection/)
})

test('client metrics remain batched for the visible page', () => {
  assert.match(clientsPage, /\.in\('client_id', ids\)/)
  assert.doesNotMatch(clientsPage, /clientRows\.map\(async/)
})
