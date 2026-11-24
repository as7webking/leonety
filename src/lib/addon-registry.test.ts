import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { builtInAddonRegistry, canChangeWorkspaceAddonActivation, getWorkspaceAddonCapabilities, resolveEnabledWorkspaceAddons, resolveWorkspaceAddonActivationStates, type BuiltInAddonDefinition } from './addons/registry.ts'

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

test('missing persisted rows resolve to disabled and availability is distinct from activation', () => {
  const [state] = resolveWorkspaceAddonActivationStates([])
  assert.equal(state.enabled, false)
  assert.equal(state.available, false)
  assert.equal(state.canEnable, false)
  assert.equal(state.canOpen, false)

  const available: BuiltInAddonDefinition = { ...builtInAddonRegistry[0], status: 'available', route: '/app/cash' }
  assert.deepEqual(getWorkspaceAddonCapabilities(available, false), {
    available: true,
    canEnable: true,
    canOpen: false,
  })
  assert.deepEqual(getWorkspaceAddonCapabilities({ ...available, requiredEntitlement: 'cash' }, false), {
    available: true,
    canEnable: false,
    canOpen: false,
  })
  assert.equal(getWorkspaceAddonCapabilities(available, true).canOpen, true)
  assert.equal(canChangeWorkspaceAddonActivation(builtInAddonRegistry[0], true), false)
  assert.equal(canChangeWorkspaceAddonActivation(builtInAddonRegistry[0], false), true)
  assert.equal(canChangeWorkspaceAddonActivation(available, true), true)
})

test('enabled state never opens a planned addon without an available registered route', () => {
  const [state] = resolveWorkspaceAddonActivationStates([{ addon_id: 'kassenbuch-de', enabled: true }])
  assert.equal(state.enabled, true)
  assert.equal(state.available, false)
  assert.equal(state.canOpen, false)
})
