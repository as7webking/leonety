import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  FileText,
  FileSignature,
  Landmark,
  MapPin,
  Package,
  ReceiptText,
  Repeat2,
  Timer,
  UserRoundCog,
  Users,
  WalletCards,
  Settings,
} from 'lucide-react'
import type { AppMode } from '@/lib/app-mode'

export type NavigationItem = {
  href: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  desktopOnly?: boolean
  modes?: readonly AppMode[]
}

export type NavigationGroup = {
  labelKey: string
  items: NavigationItem[]
}

export const primaryNavigation: NavigationItem[] = [
  { href: '/app/dashboard', labelKey: 'nav.dashboard', icon: BarChart3 },
  { href: '/app/time', labelKey: 'nav.time', icon: Clock3 },
]

export const navigationGroups: NavigationGroup[] = [
  {
    labelKey: 'nav.finance',
    items: [
      { href: '/app/transactions', labelKey: 'nav.allTransactions', icon: Repeat2 },
      { href: '/app/income', labelKey: 'nav.income', icon: WalletCards },
      { href: '/app/expenses', labelKey: 'nav.expenses', icon: ReceiptText },
    ],
  },
  {
    labelKey: 'nav.crm',
    items: [
      { href: '/app/clients', labelKey: 'nav.clients', icon: Users, modes: ['business'] },
      { href: '/app/invoices', labelKey: 'nav.invoices', icon: FileText, modes: ['business'] },
      { href: '/app/contracts', labelKey: 'nav.contracts', icon: FileSignature, modes: ['business'] },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { href: '/app/products', labelKey: 'nav.products', icon: Package, modes: ['business'] },
      { href: '/app/inventory', labelKey: 'nav.inventory', icon: Landmark, modes: ['business'] },
      { href: '/app/stock-movements', labelKey: 'nav.stockMovements', icon: Timer, modes: ['business'] },
      { href: '/app/employees', labelKey: 'nav.employees', icon: UserRoundCog, desktopOnly: true, modes: ['business'] },
      { href: '/app/shifts', labelKey: 'nav.shifts', icon: CalendarDays, desktopOnly: true, modes: ['business'] },
      { href: '/app/locations', labelKey: 'nav.locations', icon: MapPin, desktopOnly: true, modes: ['business'] },
    ],
  },
  {
    labelKey: 'nav.workspace',
    items: [
      { href: '/app/workspaces', labelKey: 'nav.workspaces', icon: Building2 },
      { href: '/app/settings/integrations', labelKey: 'nav.storeIntegrations', icon: BriefcaseBusiness, modes: ['business'] },
      { href: '/app/settings/notifications', labelKey: 'nav.notifications', icon: Bell },
      { href: '/app/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
]

export const flatNavigationItems = [
  ...primaryNavigation,
  ...navigationGroups.flatMap((group) => group.items),
]

function isVisibleInMode(item: NavigationItem, mode: AppMode) {
  return !item.modes || item.modes.includes(mode)
}

export function getNavigationForMode(mode: AppMode) {
  return {
    primary: primaryNavigation.filter((item) => isVisibleInMode(item, mode)),
    groups: navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => isVisibleInMode(item, mode)),
      }))
      .filter((group) => group.items.length > 0),
  }
}

export function isNavigationItemActive(pathname: string, href: string) {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const normalizedHref = href.length > 1 ? href.replace(/\/+$/, '') : href
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`)
}
