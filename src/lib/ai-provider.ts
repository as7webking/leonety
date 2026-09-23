import 'server-only'

export type AiProviderName = 'openai'

export interface GenerateAiTextInput {
  instructions: string
  input: string
  maxOutputTokens?: number
  responseFormat?: 'text' | 'json_object'
}

export interface AiProviderCapabilities {
  text: boolean
  json: boolean
  streaming: boolean
}

export type AiProviderErrorCode =
  | 'provider_not_configured'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_invalid_response'

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode) {
    super(code)
  }
}

interface AiProviderAdapter {
  name: AiProviderName
  capabilities: AiProviderCapabilities
  generate: (input: GenerateAiTextInput) => Promise<string>
}

export function getAiProviderName(): AiProviderName {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (!provider || provider === 'openai') return 'openai'
  throw new AiProviderError('provider_not_configured')
}

export function getAiModelName() {
  return process.env.AI_MODEL?.trim() || 'gpt-5-mini'
}

function getAiApiKey() {
  const key = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new AiProviderError('provider_not_configured')
  }
  return key
}

const openAiProvider: AiProviderAdapter = {
  name: 'openai',
  capabilities: {
    text: true,
    json: true,
    streaming: false,
  },
  async generate({
    instructions,
    input,
    maxOutputTokens = 900,
    responseFormat = 'text',
  }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${getAiApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: getAiModelName(),
          instructions,
          input,
          max_output_tokens: maxOutputTokens,
          ...(responseFormat === 'json_object' ? { text: { format: { type: 'json_object' } } } : {}),
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AiProviderError('provider_auth_failed')
        }
        if (response.status === 429) throw new AiProviderError('provider_rate_limited')
        throw new AiProviderError('provider_unavailable')
      }

      const text = extractResponseText(payload)
      if (!text) throw new AiProviderError('provider_invalid_response')
      return text
    } catch (error) {
      if (error instanceof AiProviderError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('provider_timeout')
      }
      throw new AiProviderError('provider_unavailable')
    } finally {
      clearTimeout(timeout)
    }
  },
}

function getAiProviderAdapter(): AiProviderAdapter {
  const provider = getAiProviderName()
  if (provider === 'openai') return openAiProvider
  throw new AiProviderError('provider_not_configured')
}

export function getAiProviderCapabilities() {
  return getAiProviderAdapter().capabilities
}

export function getAiConfigurationStatus() {
  let provider: AiProviderName
  try {
    provider = getAiProviderName()
  } catch {
    return {
      provider: 'openai' as const,
      model: getAiModelName(),
      configured: false,
    }
  }

  return {
    provider,
    model: getAiModelName(),
    configured: Boolean(process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()),
  }
}

function extractResponseText(payload: unknown) {
  const record = payload as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>
  }

  if (typeof record.output_text === 'string') return record.output_text

  return record.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join('\n') ?? ''
}

export async function generateAiText({
  instructions,
  input,
  maxOutputTokens = 900,
  responseFormat = 'text',
}: GenerateAiTextInput) {
  return getAiProviderAdapter().generate({ instructions, input, maxOutputTokens, responseFormat })
}
