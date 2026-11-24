import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getNavigationForMode } from '../components/app-shell/navigation-items.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { builtInAddonRegistry } from './addons/registry.ts'

test('catalog navigation is present in both modes and leaves existing workspace links in place', () => {
  for (const mode of ['personal', 'business'] as const) {
    const navigation = getNavigationForMode(mode)
    const links = [...navigation.primary, ...navigation.groups.flatMap((group) => group.items)]
    assert.ok(links.some((item) => item.href === '/app/addons' && item.labelKey === 'nav.addons'))
    assert.equal(navigation.addonGroup, null)
  }

  const workspaceLinks = getNavigationForMode('business').groups.find((group) => group.labelKey === 'nav.workspace')?.items.map((item) => item.href)
  assert.deepEqual(workspaceLinks?.slice(-2), ['/app/settings', '/app/addons'])
})

test('only supplied active addon links enter the dedicated sidebar group', () => {
  const readyAddon = builtInAddonRegistry[0]
  const navigation = getNavigationForMode('business', [{
    href: '/app/kassenbuch', labelKey: readyAddon.titleKey, icon: () => null,
  }])
  assert.deepEqual(navigation.addonGroup?.items.map((item) => item.href), ['/app/kassenbuch'])

  const disabled = getNavigationForMode('business')
  assert.equal(disabled.addonGroup, null)
})

test('catalog is inside the authenticated app route and does not offer fake activation controls', () => {
  const page = readFileSync(new URL('../app/(app)/addons/page.tsx', import.meta.url), 'utf8')
  const appLayout = readFileSync(new URL('../app/(app)/layout.tsx', import.meta.url), 'utf8')
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')

  assert.match(appLayout, /AuthenticatedLayout/)
  assert.match(proxy, /const protectedRoutes = \['\/app'\]/)
  assert.match(page, /addons\.activationUnavailable/)
  assert.doesNotMatch(page, /Activate|Deactivate|fetch\(/i)
})
