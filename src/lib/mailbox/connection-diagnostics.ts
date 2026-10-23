export type MailProtocol = 'imap' | 'smtp'
export type MailboxConnectionDiagnostic = 'invalid_host' | 'server_unreachable' | 'connection_timeout' | 'tls_certificate_failure' | 'authentication_rejected' | 'imap_authentication_rejected' | 'smtp_authentication_rejected' | 'provider_unavailable'

export function firstMailboxTestFailure(results: {
  imap: { ok: boolean; error?: string }
  smtp: { ok: boolean; error?: string }
}) {
  if (!results.imap.ok) return { protocol: 'imap' as const, error: results.imap.error ?? 'provider_unavailable' }
  if (!results.smtp.ok) return { protocol: 'smtp' as const, error: results.smtp.error ?? 'provider_unavailable' }
  return null
}

export function classifyMailboxConnectionFailure(error: unknown, protocol?: MailProtocol): MailboxConnectionDiagnostic {
  const value = error && typeof error === 'object'
    ? error as { code?: unknown; responseCode?: unknown; command?: unknown; message?: unknown }
    : {}
  const code = typeof value.code === 'string' ? value.code.toUpperCase() : ''
  const message = typeof value.message === 'string' ? value.message.slice(0, 240).toUpperCase() : ''
  if (value.responseCode === 535 || /AUTHENTICATIONFAILED|EAUTH|AUTH_FAILED|ELOGIN/.test(code) || /AUTHENTICATION FAILED|INVALID CREDENTIALS/.test(message) || value.command === 'AUTH') {
    return protocol ? `${protocol}_authentication_rejected` : 'authentication_rejected'
  }
  if (/CERT|TLS|SSL/.test(code) || /CERTIFICATE|TLS HANDSHAKE|SELF.SIGNED/.test(message)) return 'tls_certificate_failure'
  if (/TIMEOUT|ETIMEDOUT/.test(code) || /TIMED OUT|TIMEOUT/.test(message)) return 'connection_timeout'
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ESOCKET/.test(code) || /HOST NOT FOUND|CONNECTION REFUSED/.test(message)) return 'server_unreachable'
  return 'provider_unavailable'
}
