export type MailboxProviderId = 'google' | 'microsoft' | 'imap'
export type MailboxFolder = 'inbox' | 'sent'
export type MailboxFilter = 'all' | 'unread'

export interface MailboxMessageSummary {
  id: string
  providerMessageId: string
  provider: MailboxProviderId
  connectionId: string
  threadId: string | null
  mailboxId: string
  mailboxEmail: string
  folder: MailboxFolder
  from: { name: string | null; email: string }
  to: string[]
  subject: string
  snippet: string
  receivedAt: string | null
  isRead: boolean
  hasAttachments: boolean
}

export interface MailboxMessage extends MailboxMessageSummary {
  textBody: string
  replyTo: string | null
  references: string[]
}

export interface MailboxPage {
  messages: MailboxMessageSummary[]
  nextCursor: string | null
}

export interface MailboxConnectionRecord {
  id: string
  company_id: string
  provider: MailboxProviderId
  provider_account_email: string
  display_name: string | null
  provider_account_id: string | null
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  granted_scopes: string[]
  credentials_encrypted: string | null
  status: 'connected' | 'reconnect_required' | 'error' | 'disabled' | 'plan_restricted'
  created_at: string
  last_successful_connection_at: string | null
  last_error_code: string | null
}

export interface MailboxSendInput {
  to: string[]
  cc?: string[]
  subject: string
  text: string
  replyToMessageId?: string
}

export interface MailboxProvider {
  testConnection(): Promise<void>
  listMessages(folder: MailboxFolder, cursor?: string | null, limit?: number, filter?: MailboxFilter): Promise<MailboxPage>
  getMessage(folder: MailboxFolder, id: string): Promise<MailboxMessage>
  setRead(folder: MailboxFolder, id: string, read: boolean): Promise<void>
  sendMessage(input: MailboxSendInput): Promise<void>
  reply(input: MailboxSendInput): Promise<void>
  disconnect(): Promise<void>
}

export class MailboxProviderError extends Error {
  constructor(readonly code: 'reconnect_required' | 'missing_scope' | 'rate_limited' | 'provider_unavailable' | 'provider_error' | 'invalid_host' | 'server_unreachable' | 'connection_timeout' | 'tls_certificate_failure' | 'authentication_rejected' | 'imap_authentication_rejected' | 'smtp_authentication_rejected' | 'sent_folder_unavailable' | 'invalid_message' | 'message_not_found') {
    super(code)
    this.name = 'MailboxProviderError'
  }
}
