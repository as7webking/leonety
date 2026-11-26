'use client'

import { usePathname } from 'next/navigation'
import { getActiveNavigationHref, getEnabledAddonNavigationItems, getNavigationForMode } from '@/components/app-shell/navigation-items'
import { useCompany } from '@/contexts/company-context'
import { useWorkspaceAddons } from '@/contexts/workspace-addon-context'
import { normalizeAppMode } from '@/lib/app-mode'
import { builtInAddonRegistry } from '@/lib/addons/registry'

export function useAppNavigation() {
  const pathname = usePathname()
  const { currentCompany } = useCompany()
  const { enabledAddonIds } = useWorkspaceAddons()
  const navigation = getNavigationForMode(
    normalizeAppMode(currentCompany?.type),
    getEnabledAddonNavigationItems(enabledAddonIds, builtInAddonRegistry),
  )
  const items = [
    ...navigation.primary,
    ...navigation.groups.flatMap((group) => group.items),
    ...(navigation.addonGroup?.items ?? []),
  ]

  return { navigation, activeHref: getActiveNavigationHref(pathname, items) }
}
