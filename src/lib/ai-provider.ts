import 'server-only'

import {
  classifyAiProviderStatus,
  extractAiResponseText,
  shouldRetryAiProviderError,
} from '@/lib/ai-provider-response'

export type AiProviderName = 'openai'

export interface GenerateAiTextInput {
  instructions: string
  input: string
  maxOutputTokens?: number
  responseFormat?: 'text' | 'json_object'
}

export interface GenerateAiVisionJsonInput {
  instructions: string
  prompt: string
  imageDataUrl: string
  maxOutputTokens?: number
}

export interface AiProviderCapabilities {
  text: boolean
  json: boolean
  streaming: boolean
  vision: boolean
}

export type AiProviderErrorCode =
  | 'configuration_missing'
  | 'provider_auth_failed'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'provider_unavailable'
  | 'invalid_model'
  | 'request_timeout'
  | 'invalid_response'

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode) {
    super(code)
  }
}

interface AiProviderAdapter {
  name: AiProviderName
  capabilities: AiProviderCapabilities
  generate: (input: GenerateAiTextInput) => Promise<string>
  generateVisionJson: (input: GenerateAiVisionJsonInput) => Promise<string>
}

export function getAiProviderName(): AiProviderName {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (!provider || provider === 'openai') return 'openai'
  throw new AiProviderError('configuration_missing')
}

export function getAiModelName() {
  return process.env.AI_MODEL?.trim() || 'gpt-5-mini'
}

function getAiApiKey() {
  const key = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new AiProviderError('configuration_missing')
  }
  return key
}

const openAiProvider: AiProviderAdapter = {
  name: 'openai',
  capabilities: {
    text: true,
    json: true,
    streaming: false,
    vision: true,
  },
  async generate({
    instructions,
    input,
    maxOutputTokens = 900,
    responseFormat = 'text',
  }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
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
            const code = classifyAiProviderStatus(response.status, payload)
            if (shouldRetryAiProviderError(code, attempt)) {
              await new Promise((resolve) => setTimeout(resolve, 250))
              continue
            }
            throw new AiProviderError(code)
          }

          const text = extractAiResponseText(payload)
          if (!text) throw new AiProviderError('invalid_response')
          return text
        } catch (error) {
          if (error instanceof AiProviderError) throw error
          if (error instanceof Error && error.name === 'AbortError') {
            throw new AiProviderError('request_timeout')
          }
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 250))
            continue
          }
          throw new AiProviderError('provider_unavailable')
        }
      }

      throw new AiProviderError('provider_unavailable')
    } catch (error) {
      if (error instanceof AiProviderError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('request_timeout')
      }
      throw new AiProviderError('provider_unavailable')
    } finally {
      clearTimeout(timeout)
    }
  },
  async generateVisionJson({
    instructions,
    prompt,
    imageDataUrl,
    maxOutputTokens = 1800,
  }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35_000)

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
          input: [{
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
            ],
          }],
          max_output_tokens: maxOutputTokens,
          text: { format: { type: 'json_object' } },
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new AiProviderError(classifyAiProviderStatus(response.status, payload))
      }

      const text = extractAiResponseText(payload)
      if (!text) throw new AiProviderError('invalid_response')
      return text
    } catch (error) {
      if (error instanceof AiProviderError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError('request_timeout')
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
  throw new AiProviderError('configuration_missing')
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

export async function generateAiText({
  instructions,
  input,
  maxOutputTokens = 900,
  responseFormat = 'text',
}: GenerateAiTextInput) {
  return getAiProviderAdapter().generate({ instructions, input, maxOutputTokens, responseFormat })
}

export async function generateAiVisionJson(input: GenerateAiVisionJsonInput) {
  const provider = getAiProviderAdapter()
  if (!provider.capabilities.vision) throw new AiProviderError('configuration_missing')
  return provider.generateVisionJson(input)
}
