export type AiProviderResponseErrorCode =
  | 'provider_auth_failed'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'invalid_model'
  | 'request_timeout'
  | 'provider_unavailable'

export function classifyAiProviderStatus(status: number, payload?: unknown): AiProviderResponseErrorCode {
  if (status === 401 || status === 403) return 'provider_auth_failed'
  if (status === 408) return 'request_timeout'

  const error = payload && typeof payload === 'object'
    ? (payload as { error?: { code?: unknown; type?: unknown; param?: unknown } }).error
    : null
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : ''
  const type = typeof error?.type === 'string' ? error.type.toLowerCase() : ''
  const param = typeof error?.param === 'string' ? error.param.toLowerCase() : ''

  if (status === 429) {
    if (code === 'credit_balance_exhausted' || code === 'insufficient_quota' || type === 'insufficient_quota') {
      return 'quota_exhausted'
    }
    return 'rate_limited'
  }

  if ((status === 400 || status === 404) && (
    code.includes('model') || type.includes('model') || param === 'model'
  )) {
    return 'invalid_model'
  }

  return 'provider_unavailable'
}

export function shouldRetryAiProviderError(code: AiProviderResponseErrorCode, attempt: number) {
  return code === 'provider_unavailable' && attempt === 0
}

export function classifyAiProviderRuntimeError(error: unknown): 'request_timeout' | 'provider_unavailable' {
  return error instanceof Error && error.name === 'AbortError'
    ? 'request_timeout'
    : 'provider_unavailable'
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
