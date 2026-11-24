export const addonIds = ['kassenbuch-de'] as const

export type BuiltInAddonId = typeof addonIds[number]
export type BuiltInAddonCategory = 'finance' | 'operations' | 'productivity'

export type BuiltInAddonDefinition = {
  id: BuiltInAddonId
  version: 1
  category: BuiltInAddonCategory
  titleKey: string
  descriptionKey: string
  defaultEnabled: false
  route: string | null
  requiredEntitlement: string | null
  status: 'planned' | 'available'
}

export const builtInAddonRegistry: readonly BuiltInAddonDefinition[] = [
  {
    id: 'kassenbuch-de',
    version: 1,
    category: 'finance',
    titleKey: 'addons.kassenbuchDe.title',
    descriptionKey: 'addons.kassenbuchDe.description',
    defaultEnabled: false,
    route: null,
    requiredEntitlement: null,
    status: 'planned',
  },
]

export type WorkspaceAddonActivation = {
  workspaceId: string
  addonId: string
  enabled: boolean
}

export type WorkspaceAddonAccess = {
  workspaceId: string
  entitledAddonIds: readonly string[]
}

export type WorkspaceAddonCapabilities = {
  available: boolean
  canEnable: boolean
  canOpen: boolean
}

export type WorkspaceAddonActivationState = WorkspaceAddonCapabilities & {
  addonId: BuiltInAddonId
  enabled: boolean
}

export function getWorkspaceAddonCapabilities(
  addon: BuiltInAddonDefinition,
  enabled: boolean,
  entitledAddonIds: readonly string[] = [],
): WorkspaceAddonCapabilities {
  const available = addon.status === 'available' && addon.route !== null
  const entitled = addon.requiredEntitlement === null || entitledAddonIds.includes(addon.requiredEntitlement)

  return {
    available,
    canEnable: available && entitled,
    canOpen: enabled && available && entitled,
  }
}

export function canChangeWorkspaceAddonActivation(
  addon: BuiltInAddonDefinition,
  requestedEnabled: boolean,
  entitledAddonIds: readonly string[] = [],
) {
  return !requestedEnabled || getWorkspaceAddonCapabilities(addon, false, entitledAddonIds).canEnable
}

export function resolveWorkspaceAddonActivationStates(
  rows: readonly { addon_id: string; enabled: boolean }[],
  registry: readonly BuiltInAddonDefinition[] = builtInAddonRegistry,
): WorkspaceAddonActivationState[] {
  const stored = new Map(rows.map((row) => [row.addon_id, row.enabled]))
  return registry.map((addon) => {
    const enabled = stored.get(addon.id) === true
    return {
      addonId: addon.id,
      enabled,
      ...getWorkspaceAddonCapabilities(addon, enabled),
    }
  })
}

/**
 * Resolves already-authorized activation data. Callers must load activations only
 * after authenticating the user and verifying access to the requested workspace.
 */
export function resolveEnabledWorkspaceAddons(
  access: WorkspaceAddonAccess,
  activations: readonly WorkspaceAddonActivation[],
  registry: readonly BuiltInAddonDefinition[] = builtInAddonRegistry,
): BuiltInAddonDefinition[] {
  const enabledIds = new Set(
    activations
      .filter((activation) => activation.workspaceId === access.workspaceId && activation.enabled)
      .map((activation) => activation.addonId),
  )
  const entitledIds = new Set(access.entitledAddonIds)

  return registry.filter((addon) =>
    enabledIds.has(addon.id)
    && getWorkspaceAddonCapabilities(addon, true, [...entitledIds]).canOpen,
  )
}
