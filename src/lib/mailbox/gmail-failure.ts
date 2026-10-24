export type GmailFailureCategory =
  | 'oauth_configuration'
  | 'consent_denied'
  | 'missing_scope'
  | 'callback_failed'
  | 'token_exchange_failed'
  | 'token_storage_failed'
  | 'mailbox_identity_failed'
  | 'gmail_api_failed'
  | 'token_refresh_failed'
  | 'reconnect_required'

export function classifyGmailConnectFailure(stage: string, code?: string | null): GmailFailureCategory {
  if (code === 'oauth_configuration') return 'oauth_configuration'
  if (code === 'missing_scope') return 'missing_scope'
  if (code === 'reconnect_required' || code === 'authorization_expired') return 'reconnect_required'
  if (stage === 'configuration') return 'oauth_configuration'
  if (stage === 'consent') return 'consent_denied'
  if (stage === 'token_exchange') return 'token_exchange_failed'
  if (stage === 'token_storage') return 'token_storage_failed'
  if (stage === 'mailbox_identity') return 'mailbox_identity_failed'
  if (stage === 'gmail_api') return 'gmail_api_failed'
  if (stage === 'token_refresh') return 'token_refresh_failed'
  return 'callback_failed'
}

export function classifyGmailProviderError(error: string | null): 'oauth_configuration' | 'consent_denied' | 'callback_failed' {
  if (error === 'access_denied') return 'consent_denied'
  if (error === 'invalid_client' || error === 'unauthorized_client' || error === 'redirect_uri_mismatch') {
    return 'oauth_configuration'
  }
  return 'callback_failed'
}
