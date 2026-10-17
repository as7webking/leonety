export const productListColumns = 'id, company_id, name, category_id, sku, barcode, category, description, purchase_price, selling_price, currency, current_stock, low_stock_threshold, status, image_url, created_at, updated_at' as const

export const dashboardFinancialColumns = 'id, amount, description, category, date, currency, company_id, workspace_amount, workspace_currency' as const

export const dashboardLegacyFinancialColumns = 'id, amount, description, category, date, currency, company_id' as const
export const dashboardTimeEntryColumns = 'id, description, hours, date, company_id' as const

export function isMissingDashboardSnapshotColumns(error: { code?: string } | null | undefined) {
  return ['42703', 'PGRST204', 'PGRST205'].includes(error?.code ?? '')
}
