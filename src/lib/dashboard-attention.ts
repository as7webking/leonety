export type DashboardAttentionType = 'overdue_invoices' | 'low_stock_products' | 'woocommerce_sync_errors' | 'mailbox_reconnect' | 'integration_errors'

export interface DashboardAttentionItem {
  type: DashboardAttentionType
  count: number
  href: string
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
