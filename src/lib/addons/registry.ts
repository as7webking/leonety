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
    addon.status === 'available'
    && addon.route !== null
    && enabledIds.has(addon.id)
    && (addon.requiredEntitlement === null || entitledIds.has(addon.requiredEntitlement)),
  )
}
