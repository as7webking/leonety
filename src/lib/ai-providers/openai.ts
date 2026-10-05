import 'server-only'

import {
  AiProviderError,
  type AiProvider,
  type GenerateAiTextInput,
  type GenerateAiVisionJsonInput,
} from '@/lib/ai-provider-contract'
import {
  classifyAiProviderStatus,
  classifyAiProviderRuntimeError,
  extractAiResponseText,
  shouldRetryAiProviderError,
} from '@/lib/ai-provider-response'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini'

export function getOpenAiModelName() {
  return process.env.AI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
}

function getOpenAiApiKey() {
  const key = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new AiProviderError('configuration_missing')
  return key
}

function validateOpenAiConfiguration() {
  const configured = Boolean(process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim())
  return {
    provider: 'openai' as const,
    model: getOpenAiModelName(),
    configured,
    ...(configured ? {} : { error: 'configuration_missing' as const }),
  }
}

async function generateOpenAiText({ instructions, input, maxOutputTokens = 900, responseFormat = 'text' }: GenerateAiTextInput) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(OPENAI_RESPONSES_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${getOpenAiApiKey()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: getOpenAiModelName(),
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
        if (classifyAiProviderRuntimeError(error) === 'request_timeout') throw new AiProviderError('request_timeout')
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
    throw new AiProviderError(classifyAiProviderRuntimeError(error))
  } finally {
    clearTimeout(timeout)
  }
}

async function generateOpenAiVisionJson({ instructions, prompt, imageDataUrl, maxOutputTokens = 1800 }: GenerateAiVisionJsonInput) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 35_000)

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: getOpenAiModelName(),
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
    if (!response.ok) throw new AiProviderError(classifyAiProviderStatus(response.status, payload))

    const text = extractAiResponseText(payload)
    if (!text) throw new AiProviderError('invalid_response')
    return text
  } catch (error) {
    if (error instanceof AiProviderError) throw error
    throw new AiProviderError(classifyAiProviderRuntimeError(error))
  } finally {
    clearTimeout(timeout)
  }
}

export const openAiProvider: AiProvider = {
  name: 'openai',
  capabilities: { text: true, json: true, streaming: false, vision: true },
  validateConfiguration: validateOpenAiConfiguration,
  async healthCheck() {
    const status = validateOpenAiConfiguration()
    return { provider: status.provider, model: status.model, ready: status.configured, error: status.error }
  },
  generate: generateOpenAiText,
  classify: generateOpenAiText,
  generateVisionJson: generateOpenAiVisionJson,
}
