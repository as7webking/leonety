export type AiProviderResponseErrorCode =
  | 'provider_auth_failed'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'invalid_model'
  | 'request_timeout'
  | 'provider_unavailable'

export function classifyAiProviderStatus(status: number, payload?: unknown): AiProviderResponseErrorCode {
  if (status === 401 || status === 403) return 'provider_auth_failed'
  if (status === 408 || status === 504) return 'request_timeout'

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

function safeProviderValue(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(value)) return undefined
  return value
}

export function getSafeProviderErrorFields(payload: unknown) {
  if (!payload || typeof payload !== 'object') return {}
  const error = (payload as { error?: { code?: unknown; type?: unknown } }).error
  if (!error || typeof error !== 'object') return {}
  const providerErrorType = safeProviderValue(error.type)
  const providerErrorCode = safeProviderValue(error.code)
  return {
    ...(providerErrorType ? { providerErrorType } : {}),
    ...(providerErrorCode ? { providerErrorCode } : {}),
  }
}

export function isIncompleteAiResponse(payload: unknown) {
  return Boolean(payload && typeof payload === 'object' && (payload as { status?: unknown }).status === 'incomplete')
}

export function getSafeIncompleteResponseCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined
  const reason = (payload as { incomplete_details?: { reason?: unknown } }).incomplete_details?.reason
  return safeProviderValue(reason)
}

export function extractAiResponseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as {
    status?: unknown
    output_text?: unknown
    output?: Array<{ content?: Array<{ text?: unknown }> }>
  }

  if (record.status === 'incomplete') return ''

  if (typeof record.output_text === 'string') return record.output_text.trim()
  if (!Array.isArray(record.output)) return ''

  return record.output
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((content) => typeof content.text === 'string' ? content.text.trim() : '')
    .filter(Boolean)
    .join('\n')
}
