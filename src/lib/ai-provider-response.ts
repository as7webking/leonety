export type AiProviderResponseErrorCode =
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_quota_exhausted'
  | 'provider_unavailable'

export function classifyAiProviderStatus(status: number, payload?: unknown): AiProviderResponseErrorCode {
  if (status === 401 || status === 403) return 'provider_auth_failed'
  if (status === 429) {
    const error = payload && typeof payload === 'object'
      ? (payload as { error?: { code?: unknown; type?: unknown } }).error
      : null
    const code = typeof error?.code === 'string' ? error.code : ''
    const type = typeof error?.type === 'string' ? error.type : ''
    if (code === 'credit_balance_exhausted' || code === 'insufficient_quota' || type === 'insufficient_quota') {
      return 'provider_quota_exhausted'
    }
    return 'provider_rate_limited'
  }
  return 'provider_unavailable'
}

export function extractAiResponseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as {
    output_text?: unknown
    output?: Array<{ content?: Array<{ text?: unknown }> }>
  }

  if (typeof record.output_text === 'string') return record.output_text.trim()
  if (!Array.isArray(record.output)) return ''

  return record.output
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((content) => typeof content.text === 'string' ? content.text.trim() : '')
    .filter(Boolean)
    .join('\n')
}
