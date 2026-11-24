import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getEnabledAddonNavigationItems, getNavigationForMode } from '../components/app-shell/navigation-items.ts'
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

test('sidebar addon links are limited to available registry routes returned for the workspace', () => {
  const planned = getEnabledAddonNavigationItems(['kassenbuch-de'], builtInAddonRegistry)
  assert.deepEqual(planned, [])

  const registrySource = readFileSync(new URL('./addons/registry.ts', import.meta.url), 'utf8')
  const navigationSource = readFileSync(new URL('../components/app-shell/navigation-items.ts', import.meta.url), 'utf8')
  assert.match(navigationSource, /addon\.status === 'available' && addon\.route/)
  assert.match(registrySource, /resolveWorkspaceAddonActivationStates/)
})

test('catalog is authenticated and consumes persisted workspace activation state', () => {
  const page = readFileSync(new URL('../app/(app)/addons/page.tsx', import.meta.url), 'utf8')
  const appLayout = readFileSync(new URL('../app/(app)/layout.tsx', import.meta.url), 'utf8')
  const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../app/api/addons/route.ts', import.meta.url), 'utf8')
  const provider = readFileSync(new URL('../contexts/workspace-addon-context.tsx', import.meta.url), 'utf8')

  assert.match(appLayout, /AuthenticatedLayout/)
  assert.match(proxy, /const protectedRoutes = \['\/app'\]/)
  assert.match(page, /useWorkspaceAddons/)
  assert.match(page, /addons\.loadFailed/)
  assert.match(api, /auth\.getUser\(\)/)
  assert.match(api, /\.eq\('owner_id', userId\)/)
  assert.match(api, /\.upsert\([\s\S]*onConflict: 'company_id,addon_id'/)
  assert.match(api, /canChangeWorkspaceAddonActivation\(addon, parsed\.data\.enabled\)/)
  assert.match(api, /activations\.filter\(\(activation\) => activation\.canOpen\)/)
  assert.match(page, /activation\.canOpen/)
  assert.doesNotMatch(api, /createSupabaseAdminClient/)
  assert.match(provider, /snapshot\.workspaceId === currentCompanyId/)
  assert.match(provider, /AbortController/)
  assert.doesNotMatch(provider, /localStorage/)
})
