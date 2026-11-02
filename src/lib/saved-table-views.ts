export type SavedTableKind = 'invoices' | 'products' | 'expenses'

export interface InvoiceTableViewState {
  statusFilter: 'all' | 'paid' | 'unpaid' | 'overdue' | 'cancelled'
}

export interface ProductTableViewState {
  query: string
  statusFilter: 'all' | 'active' | 'inactive' | 'archived'
  categoryFilter: string
  stockFilter: 'all' | 'low'
  providerFilter: 'all' | 'woocommerce' | 'shopify' | 'opencart' | 'google_merchant' | 'facebook_instagram' | 'tiktok_shop' | 'ebay' | 'amazon_marketplace' | 'kleinanzeigen' | 'olx' | 'uber_eats' | 'just_eat_takeaway' | 'glovo' | 'iss_pos' | 'none'
  imageFilter: 'all' | 'has_image' | 'missing_image'
  sortBy: 'name_asc' | 'name_desc' | 'sku_asc' | 'sku_desc' | 'barcode_asc' | 'barcode_desc' | 'stock_asc' | 'stock_desc' | 'price_asc' | 'price_desc' | 'newest' | 'oldest'
}

export interface ExpenseTableViewState {
  searchQuery: string
  groupReportsByMonth: boolean
  filterFromDate: string
  filterToDate: string
  sortBy: 'date' | 'amount'
  sortDirection: 'asc' | 'desc'
}

export type SavedTableViewState = InvoiceTableViewState | ProductTableViewState | ExpenseTableViewState

export interface SavedTableView<T extends SavedTableViewState = SavedTableViewState> {
  id: string
  name: string
  state: T
  updatedAt: number
}

export interface SavedTableViewCollection<T extends SavedTableViewState = SavedTableViewState> {
  views: SavedTableView<T>[]
  defaultViewId: string | null
}

const productChannels = ['all', 'woocommerce', 'shopify', 'opencart', 'google_merchant', 'facebook_instagram', 'tiktok_shop', 'ebay', 'amazon_marketplace', 'kleinanzeigen', 'olx', 'uber_eats', 'just_eat_takeaway', 'glovo', 'iss_pos', 'none']
const productSorts = ['name_asc', 'name_desc', 'sku_asc', 'sku_desc', 'barcode_asc', 'barcode_desc', 'stock_asc', 'stock_desc', 'price_asc', 'price_desc', 'newest', 'oldest']
const productStatuses = ['all', 'active', 'inactive', 'archived']
const invoiceStatuses = ['all', 'paid', 'unpaid', 'overdue', 'cancelled']
const MAX_VIEWS = 30
const MAX_STORAGE_LENGTH = 100_000

export function savedTableViewsStorageKey(kind: SavedTableKind, userId: string, workspaceId: string) {
  return `leonety:saved-table-views:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:${kind}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function parseSavedTableViewState(kind: SavedTableKind, value: unknown): SavedTableViewState | null {
  if (!isRecord(value)) return null
  if (kind === 'invoices') {
    if (!invoiceStatuses.includes(String(value.statusFilter))) return null
    return { statusFilter: value.statusFilter as InvoiceTableViewState['statusFilter'] }
  }
  if (kind === 'products') {
    if (!productStatuses.includes(String(value.statusFilter)) || !productChannels.includes(String(value.providerFilter)) || !productSorts.includes(String(value.sortBy))) return null
    if (!['all', 'low'].includes(String(value.stockFilter)) || !['all', 'has_image', 'missing_image'].includes(String(value.imageFilter))) return null
    if (typeof value.query !== 'string' || value.query.length > 200 || typeof value.categoryFilter !== 'string' || value.categoryFilter.length > 120) return null
    return {
      query: value.query,
      statusFilter: value.statusFilter as ProductTableViewState['statusFilter'],
      categoryFilter: value.categoryFilter,
      stockFilter: value.stockFilter as ProductTableViewState['stockFilter'],
      providerFilter: value.providerFilter as ProductTableViewState['providerFilter'],
      imageFilter: value.imageFilter as ProductTableViewState['imageFilter'],
      sortBy: value.sortBy as ProductTableViewState['sortBy'],
    }
  }
  if (typeof value.searchQuery !== 'string' || value.searchQuery.length > 200 || typeof value.groupReportsByMonth !== 'boolean') return null
  if (!validDate(value.filterFromDate) || !validDate(value.filterToDate) || !['date', 'amount'].includes(String(value.sortBy)) || !['asc', 'desc'].includes(String(value.sortDirection))) return null
  return {
    searchQuery: value.searchQuery,
    groupReportsByMonth: value.groupReportsByMonth,
    filterFromDate: value.filterFromDate,
    filterToDate: value.filterToDate,
    sortBy: value.sortBy as ExpenseTableViewState['sortBy'],
    sortDirection: value.sortDirection as ExpenseTableViewState['sortDirection'],
  }
}

export function parseSavedTableViewCollection<T extends SavedTableViewState>(kind: SavedTableKind, raw: string | null): SavedTableViewCollection<T> {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return { views: [], defaultViewId: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !Array.isArray(parsed.views)) return { views: [], defaultViewId: null }
    const views: SavedTableView<T>[] = []
    for (const item of parsed.views.slice(0, MAX_VIEWS)) {
      if (!isRecord(item) || typeof item.id !== 'string' || item.id.length > 80 || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !Number.isFinite(item.updatedAt)) continue
      const state = parseSavedTableViewState(kind, item.state)
      if (state) views.push({ id: item.id, name: item.name.trim(), state: state as T, updatedAt: Number(item.updatedAt) })
    }
    const defaultViewId = typeof parsed.defaultViewId === 'string' && views.some((view) => view.id === parsed.defaultViewId) ? parsed.defaultViewId : null
    return { views, defaultViewId }
  } catch {
    return { views: [], defaultViewId: null }
  }
}

export function serializeSavedTableViewCollection<T extends SavedTableViewState>(collection: SavedTableViewCollection<T>) {
  return JSON.stringify({ views: collection.views.slice(0, MAX_VIEWS), defaultViewId: collection.defaultViewId })
}
