export type EmailCategory = 'upgrade_request'

export type EmailErrorCode =
  | 'configuration_missing'
  | 'invalid_recipient'
  | 'provider_auth_failed'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'timeout'
  | 'unknown_error'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  category: EmailCategory
  idempotencyKey?: string
}

export type EmailSendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; code: EmailErrorCode }

export interface EmailProviderConfig {
  apiKey: string
  from: string
  defaultReplyTo: string | null
  productName: string
  appUrl: string
}
