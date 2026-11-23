import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { builtInAddonRegistry, resolveEnabledWorkspaceAddons, type BuiltInAddonDefinition } from './addons/registry.ts'

test('built-in addons are stable, typed and disabled by default', () => {
  assert.deepEqual(builtInAddonRegistry.map(({ id }) => id), ['kassenbuch-de'])
  assert.ok(builtInAddonRegistry.every((addon) => addon.defaultEnabled === false))
  assert.ok(builtInAddonRegistry.every((addon) => addon.category && addon.titleKey && addon.descriptionKey))
  assert.deepEqual(resolveEnabledWorkspaceAddons({ workspaceId: 'workspace-a', entitledAddonIds: [] }, []), [])
})

test('workspace activation is isolated and requires explicit activation, entitlement and an available route', () => {
  const availableAddon: BuiltInAddonDefinition = {
    ...builtInAddonRegistry[0],
    status: 'available',
    route: '/app/kassenbuch',
    requiredEntitlement: 'cash-book',
  }
  const activations = [
    { workspaceId: 'workspace-a', addonId: 'kassenbuch-de', enabled: true },
    { workspaceId: 'workspace-b', addonId: 'kassenbuch-de', enabled: false },
  ]

  assert.deepEqual(resolveEnabledWorkspaceAddons({ workspaceId: 'workspace-a', entitledAddonIds: [] }, activations, [availableAddon]), [])
  assert.deepEqual(resolveEnabledWorkspaceAddons({ workspaceId: 'workspace-b', entitledAddonIds: ['cash-book'] }, activations, [availableAddon]), [])
  assert.deepEqual(
    resolveEnabledWorkspaceAddons({ workspaceId: 'workspace-a', entitledAddonIds: ['cash-book'] }, activations, [availableAddon]),
    [availableAddon],
  )
})

test('unknown activation ids and planned addons never contribute navigation', () => {
  const activations = [
    { workspaceId: 'workspace-a', addonId: 'unknown-addon', enabled: true },
    { workspaceId: 'workspace-a', addonId: 'kassenbuch-de', enabled: true },
  ]

  assert.deepEqual(
    resolveEnabledWorkspaceAddons({ workspaceId: 'workspace-a', entitledAddonIds: [] }, activations),
    [],
  )
})
