export type NotificationEventType = 'invoice_overdue' | 'low_stock' | 'product_sync_failed' | 'mailbox_reconnect' | 'integration_error'

export interface NotificationEvent {
  id: string
  workspaceId: string
  type: NotificationEventType
  titleKey: string
  messageKey: string
  label: string
  timestamp: string
  href: string
  read: boolean
}

interface InvoiceSource {
  id: string
  invoice_number: string | null
  client_id: string | null
  due_date: string | null
  created_at: string
}

interface ProductSource {
  id: string
  name: string
  current_stock: number | string
  low_stock_threshold: number | string
  updated_at: string
}

interface SyncSource {
  product_id: string
  updated_at: string
}

interface MailboxSource {
  id: string
  provider: string
  provider_account_email: string
  status: string
  updated_at: string
}

interface IntegrationSource {
  id: string
  provider: string
  store_name: string | null
  updated_at: string
}

function eventId(type: NotificationEventType, entityId: string, version: string) {
  return `${type}:${entityId}:${Buffer.from(version).toString('base64url') || '0'}`
}

function timestampVersion(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : 0
  return Number.isFinite(parsed) ? Math.max(0, parsed).toString(36) : '0'
}

export function buildNotificationEvents(input: {
  workspaceId: string
  invoices: InvoiceSource[]
  clients: Array<{ id: string; name: string }>
  products: ProductSource[]
  failedWooSyncs: SyncSource[]
  mailboxes: MailboxSource[]
  integrations: IntegrationSource[]
  readKeys?: ReadonlySet<string>
}): NotificationEvent[] {
  const clientNames = new Map(input.clients.map((client) => [client.id, client.name]))
  const productNames = new Map(input.products.map((product) => [product.id, product.name]))
  const readKeys = input.readKeys ?? new Set<string>()
  const events: NotificationEvent[] = []

  for (const invoice of input.invoices) {
    const id = eventId('invoice_overdue', invoice.id, invoice.due_date ?? invoice.created_at)
    const clientName = invoice.client_id ? clientNames.get(invoice.client_id) : null
    events.push({
      id,
      workspaceId: input.workspaceId,
      type: 'invoice_overdue',
      titleKey: 'invoice_overdue_title',
      messageKey: 'invoice_overdue_message',
      label: invoice.invoice_number || clientName || invoice.id.slice(0, 8),
      timestamp: invoice.due_date ?? invoice.created_at,
      href: `/app/invoices?invoiceId=${encodeURIComponent(invoice.id)}`,
      read: readKeys.has(id),
    })
  }

  for (const product of input.products) {
    const stock = Number(product.current_stock)
    const threshold = Number(product.low_stock_threshold)
    if (!Number.isFinite(stock) || !Number.isFinite(threshold) || stock > threshold) continue
    const id = eventId('low_stock', product.id, `${stock}:${threshold}`)
    events.push({
      id,
      workspaceId: input.workspaceId,
      type: 'low_stock',
      titleKey: 'low_stock_title',
      messageKey: 'low_stock_message',
      label: product.name,
      timestamp: product.updated_at,
      href: `/app/products/${encodeURIComponent(product.id)}`,
      read: readKeys.has(id),
    })
  }

  for (const sync of input.failedWooSyncs) {
    const productName = productNames.get(sync.product_id)
    if (!productName) continue
    const id = eventId('product_sync_failed', sync.product_id, timestampVersion(sync.updated_at))
    events.push({
      id,
      workspaceId: input.workspaceId,
      type: 'product_sync_failed',
      titleKey: 'product_sync_failed_title',
      messageKey: 'product_sync_failed_message',
      label: productName,
      timestamp: sync.updated_at,
      href: `/app/products/${encodeURIComponent(sync.product_id)}`,
      read: readKeys.has(id),
    })
  }

  for (const mailbox of input.mailboxes) {
    const id = eventId('mailbox_reconnect', mailbox.id, `${mailbox.status}:${timestampVersion(mailbox.updated_at)}`)
    events.push({
      id,
      workspaceId: input.workspaceId,
      type: 'mailbox_reconnect',
      titleKey: 'mailbox_reconnect_title',
      messageKey: 'mailbox_reconnect_message',
      label: mailbox.provider_account_email,
      timestamp: mailbox.updated_at,
      href: '/app/settings/mailbox',
      read: readKeys.has(id),
    })
  }

  for (const integration of input.integrations) {
    const name = integration.store_name?.trim() || integration.provider
    const id = eventId('integration_error', integration.id, timestampVersion(integration.updated_at))
    events.push({
      id,
      workspaceId: input.workspaceId,
      type: 'integration_error',
      titleKey: 'integration_error_title',
      messageKey: 'integration_error_message',
      label: name,
      timestamp: integration.updated_at,
      href: `/app/settings/integrations/${encodeURIComponent(integration.id)}`,
      read: readKeys.has(id),
    })
  }

  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()]
  return uniqueEvents.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)).slice(0, 100)
}
