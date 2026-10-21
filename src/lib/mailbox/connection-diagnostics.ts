export type MailboxConnectionDiagnostic = 'invalid_host' | 'server_unreachable' | 'connection_timeout' | 'tls_certificate_failure' | 'authentication_rejected' | 'provider_unavailable'

export function classifyMailboxConnectionFailure(error: unknown): MailboxConnectionDiagnostic {
  const value = error && typeof error === 'object'
    ? error as { code?: unknown; responseCode?: unknown; command?: unknown; message?: unknown }
    : {}
  const code = typeof value.code === 'string' ? value.code.toUpperCase() : ''
  const message = typeof value.message === 'string' ? value.message.slice(0, 240).toUpperCase() : ''
  if (value.responseCode === 535 || /AUTHENTICATIONFAILED|EAUTH|AUTH_FAILED|ELOGIN/.test(code) || /AUTHENTICATION FAILED|INVALID CREDENTIALS/.test(message) || value.command === 'AUTH') return 'authentication_rejected'
  if (/CERT|TLS|SSL/.test(code) || /CERTIFICATE|TLS HANDSHAKE|SELF.SIGNED/.test(message)) return 'tls_certificate_failure'
  if (/TIMEOUT|ETIMEDOUT/.test(code) || /TIMED OUT|TIMEOUT/.test(message)) return 'connection_timeout'
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ESOCKET/.test(code) || /HOST NOT FOUND|CONNECTION REFUSED/.test(message)) return 'server_unreachable'
  return 'provider_unavailable'
}
