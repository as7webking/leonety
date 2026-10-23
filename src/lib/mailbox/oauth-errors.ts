export type OAuthFailureCode = 'authorization_expired' | 'missing_scope' | 'rate_limited' | 'provider_unavailable' | 'mailbox_oauth_failed'

export function classifyOAuthFailure(status: number, providerError?: string | null): OAuthFailureCode {
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'provider_unavailable'
  if (status === 401 || providerError === 'invalid_grant' || providerError === 'expired_token') return 'authorization_expired'
  if (providerError === 'invalid_scope' || providerError === 'insufficient_scope') return 'missing_scope'
  return 'mailbox_oauth_failed'
}
