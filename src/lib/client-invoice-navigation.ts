export function buildClientInvoicesHref(clientId: string, options: { create?: boolean } = {}) {
  const params = new URLSearchParams({ clientId })
  if (options.create) params.set('create', '1')
  return `/app/invoices?${params.toString()}`
}

export function filterInvoicesForClient<T extends { client_id: string | null }>(
  invoices: T[],
  clientId: string
) {
  if (!clientId) return invoices
  return invoices.filter((invoice) => invoice.client_id === clientId)
}
