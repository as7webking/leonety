import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getNavigationForMode } from '../components/app-shell/navigation-items.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { normalizeAppMode } from './app-mode.ts'

function hrefsFor(mode: 'personal' | 'business') {
  const navigation = getNavigationForMode(mode)
  return [...navigation.primary, ...navigation.groups.flatMap((group) => group.items)].map((item) => item.href)
}

test('personal mode keeps personal tools and hides business administration', () => {
  const hrefs = hrefsFor('personal')

  assert.ok(hrefs.includes('/app/dashboard'))
  assert.ok(hrefs.includes('/app/time'))
  assert.ok(hrefs.includes('/app/transactions'))
  assert.ok(hrefs.includes('/app/income'))
  assert.ok(hrefs.includes('/app/expenses'))
  assert.ok(hrefs.includes('/app/settings'))
  assert.ok(!hrefs.includes('/app/clients'))
  assert.ok(!hrefs.includes('/app/invoices'))
  assert.ok(!hrefs.includes('/app/products'))
  assert.ok(!hrefs.includes('/app/employees'))
  assert.ok(!hrefs.includes('/app/settings/integrations'))
})

test('business mode exposes implemented business routes from the same registry', () => {
  const hrefs = hrefsFor('business')

  for (const href of [
    '/app/clients',
    '/app/invoices',
    '/app/contracts',
    '/app/products',
    '/app/inventory',
    '/app/employees',
    '/app/time',
    '/app/settings/integrations',
  ]) {
    assert.ok(hrefs.includes(href), `${href} should be visible in business mode`)
  }
})

test('unknown or absent modes default to the least-privileged personal navigation', () => {
  assert.equal(normalizeAppMode(undefined), 'personal')
  assert.equal(normalizeAppMode('enterprise'), 'personal')
  assert.equal(normalizeAppMode('business'), 'business')
})

test('workspace mode updates are authenticated and owner-scoped on the server', () => {
  const source = readFileSync(new URL('../app/api/workspaces/route.ts', import.meta.url), 'utf8')

  assert.match(source, /export async function PATCH/)
  assert.match(source, /if \(!user\).*status: 401/)
  assert.match(source, /\.eq\('owner_id', user\.id\)/)
  assert.doesNotMatch(source, /delete\s*\(/i)
})

test('settings routes use the existing authenticated app rewrite architecture', () => {
  const configSource = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
  const proxySource = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')

  assert.match(configSource, /'\/settings'/)
  assert.match(configSource, /'\/settings\/:path\*'/)
  assert.match(proxySource, /'\/settings'/)
})
