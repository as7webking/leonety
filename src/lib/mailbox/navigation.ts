import type { MailboxFilter, MailboxFolder, MailboxProviderId } from './types'

export interface MailMessageRoute {
  connectionId: string
  provider: MailboxProviderId
  messageId: string
  folder: MailboxFolder
}

export interface MailRouteState {
  mailboxId: string
  folder: MailboxFolder
  filter: MailboxFilter
  message: MailMessageRoute | null
}

const providers = new Set<MailboxProviderId>(['google', 'microsoft', 'imap'])

export function parseMailRoute(search: string): MailRouteState {
  const params = new URLSearchParams(search)
  const rawFolder = params.get('folder')
  const folder: MailboxFolder = rawFolder === 'sent' ? 'sent' : 'inbox'
  const mailboxId = params.get('mailbox') || 'all'
  const rawFilter = params.get('filter')
  const filter: MailboxFilter = folder === 'inbox' && rawFilter === 'unread' ? 'unread' : 'all'
  const connectionId = params.get('messageConnection') || ''
  const messageId = params.get('messageId') || ''
  const provider = params.get('provider') as MailboxProviderId | null
  const messageFolder: MailboxFolder = params.get('messageFolder') === 'sent' ? 'sent' : 'inbox'
  const message = connectionId && messageId && provider && providers.has(provider)
    ? { connectionId, messageId, provider, folder: messageFolder }
    : null

  return { mailboxId, folder, filter, message }
}

export function mailRouteHref(state: MailRouteState) {
  const params = new URLSearchParams()
  if (state.mailboxId !== 'all') params.set('mailbox', state.mailboxId)
  if (state.folder !== 'inbox') params.set('folder', state.folder)
  if (state.filter === 'unread' && state.folder === 'inbox') params.set('filter', 'unread')
  if (state.message) {
    params.set('messageConnection', state.message.connectionId)
    params.set('provider', state.message.provider)
    params.set('messageId', state.message.messageId)
    params.set('messageFolder', state.message.folder)
  }
  const query = params.toString()
  return `/app/mail${query ? `?${query}` : ''}`
}
