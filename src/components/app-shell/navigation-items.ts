import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FileText,
  FileSignature,
  Landmark,
  Package,
  ReceiptText,
  Repeat2,
  Timer,
  Users,
  WalletCards,
} from 'lucide-react'

export type NavigationItem = {
  href: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
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
      { href: '/app/settings/integrations', labelKey: 'nav.storeIntegrations', icon: BriefcaseBusiness },
    ],
  },
]

export const flatNavigationItems = [
  ...primaryNavigation,
  ...navigationGroups.flatMap((group) => group.items),
]
