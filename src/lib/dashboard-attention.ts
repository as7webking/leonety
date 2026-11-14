export type DashboardAttentionType = 'overdue_invoices' | 'low_stock_products' | 'woocommerce_sync_errors' | 'mailbox_reconnect' | 'integration_errors'

export interface DashboardAttentionItem {
  type: DashboardAttentionType
  count: number
  href: string
}

export type DashboardAttentionDisplayState = 'loading' | 'error' | 'empty' | 'partial' | 'issues' | 'issues_partial'

export function getDashboardAttentionDisplayState(input: {
  workspaceId: string
  scope: string
  status: 'loaded' | 'partial' | 'error' | 'loading'
  items: readonly DashboardAttentionItem[]
}): DashboardAttentionDisplayState {
  if (input.scope !== input.workspaceId || input.status === 'loading') return 'loading'
  if (input.status === 'error') return 'error'
  if (input.status === 'partial') return input.items.length > 0 ? 'issues_partial' : 'partial'
  return input.items.length > 0 ? 'issues' : 'empty'
}

export type DashboardAttentionCounts = Record<DashboardAttentionType, number>

const destinations: Record<DashboardAttentionType, string> = {
  overdue_invoices: '/app/invoices',
  low_stock_products: '/app/inventory?stock=low',
  woocommerce_sync_errors: '/app/products',
  mailbox_reconnect: '/app/settings/mailbox',
  integration_errors: '/app/settings/integrations',
}

export function buildDashboardAttentionItems(counts: DashboardAttentionCounts): DashboardAttentionItem[] {
  return (Object.keys(destinations) as DashboardAttentionType[])
    .filter((type) => Number.isSafeInteger(counts[type]) && counts[type] > 0)
    .map((type) => ({ type, count: counts[type], href: destinations[type] }))
}
