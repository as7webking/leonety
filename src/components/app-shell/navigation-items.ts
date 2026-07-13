import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Clock3,
  FileText,
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
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export type NavigationGroup = {
  label: string
  items: NavigationItem[]
}

export const primaryNavigation: NavigationItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/app/time', label: 'Time', icon: Clock3 },
  { href: '/app/clients', label: 'Clients', icon: Users },
  { href: '/app/invoices', label: 'Invoices', icon: FileText },
]

export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Transactions',
    items: [
      { href: '/app/transactions', label: 'All Transactions', icon: Repeat2 },
      { href: '/app/income', label: 'Income', icon: WalletCards },
      { href: '/app/expenses', label: 'Expenses', icon: ReceiptText },
    ],
  },
  {
    label: 'Business',
    items: [
      { href: '/app/workspaces', label: 'Workspaces', icon: Building2 },
      { href: '/app/products', label: 'Products', icon: Package },
      { href: '/app/inventory', label: 'Inventory', icon: Landmark },
      { href: '/app/stock-movements', label: 'Stock Movements', icon: Timer },
      { href: '/app/settings/integrations', label: 'Store Integrations', icon: BriefcaseBusiness },
    ],
  },
]

export const flatNavigationItems = [
  ...primaryNavigation,
  ...navigationGroups.flatMap((group) => group.items),
]
