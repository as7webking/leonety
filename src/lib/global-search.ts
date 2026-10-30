export const GLOBAL_SEARCH_LIMIT_PER_GROUP = 5

export function normalizeGlobalSearchQuery(value: string | null | undefined) {
  const raw = value ?? ''
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  const query = raw.trim().replace(/\s+/g, ' ')
  if (query.length < 2 || query.length > 80) return null
  return query
}

export function escapeGlobalSearchTerm(value: string) {
  return value.replace(/[\\%_]/g, '\\$&')
}

export type GlobalSearchGroup = 'clients' | 'invoices' | 'products' | 'employees' | 'contracts'
export type QuickActionId = 'invoice' | 'client' | 'product' | 'income' | 'expense' | 'timer'

export interface QuickActionDefinition {
  id: QuickActionId
  labelKey: string
  href: string
}

export function getGlobalQuickActions(mode: 'personal' | 'business'): QuickActionDefinition[] {
  const businessActions: QuickActionDefinition[] = mode === 'business' ? [
    { id: 'invoice', labelKey: 'invoices.add', href: '/app/invoices?create=1' },
    { id: 'client', labelKey: 'clients.crm.createClient', href: '/app/clients/new' },
    { id: 'product', labelKey: 'products.add', href: '/app/products/new' },
  ] : []

  return [
    ...businessActions,
    { id: 'income', labelKey: 'income.add', href: '/app/income?create=1' },
    { id: 'expense', labelKey: 'expenses.add', href: '/app/expenses?create=1' },
    { id: 'timer', labelKey: 'time.startTimer', href: '/app/time?start=1' },
  ]
}

export function globalSearchHref(group: GlobalSearchGroup, id: string) {
  const encodedId = encodeURIComponent(id)
  switch (group) {
    case 'clients': return `/app/clients/${encodedId}`
    case 'invoices': return `/app/invoices?invoiceId=${encodedId}`
    case 'products': return `/app/products/${encodedId}`
    case 'employees': return `/app/employees/${encodedId}`
    case 'contracts': return `/app/contracts?contractId=${encodedId}`
  }
}
