import type { MailboxProviderError } from './types'

export function classifyGoogleApiFailure(status: number, payload: unknown): MailboxProviderError['code'] {
  if (status === 401) return 'reconnect_required'
  if (status === 403) {
    const text = JSON.stringify(payload ?? '').toLowerCase()
    if (text.includes('insufficientpermissions') || text.includes('insufficient_scope')) return 'missing_scope'
  }
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_unavailable'
  return 'provider_error'
}
