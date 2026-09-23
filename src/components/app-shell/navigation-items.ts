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
} from 'lucide-react'

export type NavigationItem = {
  href: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  desktopOnly?: boolean
}

export type NavigationGroup = {
  labelKey: string
  items: NavigationItem[]
}

export const primaryNavigation: NavigationItem[] = [
  { href: '/app/dashboard', labelKey: 'nav.dashboard', icon: BarChart3 },
  { href: '/app/time', labelKey: 'nav.time', icon: Clock3 },
  { href: '/app/clients', labelKey: 'nav.clients', icon: Users },
  { href: '/app/invoices', labelKey: 'nav.invoices', icon: FileText },
  { href: '/app/contracts', labelKey: 'nav.contracts', icon: FileSignature },
]

export const navigationGroups: NavigationGroup[] = [
  {
    labelKey: 'nav.transactions',
    items: [
      { href: '/app/transactions', labelKey: 'nav.allTransactions', icon: Repeat2 },
      { href: '/app/income', labelKey: 'nav.income', icon: WalletCards },
      { href: '/app/expenses', labelKey: 'nav.expenses', icon: ReceiptText },
    ],
  },
  {
    labelKey: 'nav.business',
    items: [
      { href: '/app/workspaces', labelKey: 'nav.workspaces', icon: Building2 },
      { href: '/app/products', labelKey: 'nav.products', icon: Package },
      { href: '/app/inventory', labelKey: 'nav.inventory', icon: Landmark },
      { href: '/app/stock-movements', labelKey: 'nav.stockMovements', icon: Timer },
      { href: '/app/employees', labelKey: 'nav.employees', icon: UserRoundCog, desktopOnly: true },
      { href: '/app/shifts', labelKey: 'nav.shifts', icon: CalendarDays, desktopOnly: true },
      { href: '/app/locations', labelKey: 'nav.locations', icon: MapPin, desktopOnly: true },
      { href: '/app/settings/integrations', labelKey: 'nav.storeIntegrations', icon: BriefcaseBusiness },
      { href: '/app/settings/notifications', labelKey: 'nav.notifications', icon: Bell },
    ],
  },
]

export const flatNavigationItems = [
  ...primaryNavigation,
  ...navigationGroups.flatMap((group) => group.items),
]

export function isNavigationItemActive(pathname: string, href: string) {
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const normalizedHref = href.length > 1 ? href.replace(/\/+$/, '') : href
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`)
}
