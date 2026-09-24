export type AiProviderResponseErrorCode =
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_unavailable'

export function classifyAiProviderStatus(status: number): AiProviderResponseErrorCode {
  if (status === 401 || status === 403) return 'provider_auth_failed'
  if (status === 429) return 'provider_rate_limited'
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
