export interface MailView {
  connectionId: string
  folder: 'inbox' | 'sent'
  filter: 'all' | 'unread'
}

interface RefreshConnection {
  id: string
  status: string
}

export async function refreshMailView<T extends RefreshConnection>(options: {
  view: MailView
  connections: T[]
  reloadMessages: (view: MailView) => Promise<void>
}) {
  const connectedIds = new Set(options.connections.filter((connection) => connection.status === 'connected').map((connection) => connection.id))
  const view = options.view.connectionId === 'all' || connectedIds.has(options.view.connectionId)
    ? options.view
    : { ...options.view, connectionId: 'all' }

  await options.reloadMessages(view)
  return { view }
}
