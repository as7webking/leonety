import 'server-only'

export type AiProviderName = 'openai'

interface GenerateAiTextInput {
  instructions: string
  input: string
  maxOutputTokens?: number
  responseFormat?: 'text' | 'json_object'
}

export function getAiProviderName(): AiProviderName {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  if (!provider || provider === 'openai') return 'openai'
  throw new Error('Unsupported AI_PROVIDER. Supported value: openai.')
}

export function getAiModelName() {
  return process.env.AI_MODEL?.trim() || 'gpt-5-mini'
}

function getAiApiKey() {
  const key = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('AI_API_KEY is required server-side.')
  }
  return key
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
  getAiProviderName()
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
      throw new Error('AI provider request failed.')
    }

    const text = extractResponseText(payload)
    if (!text) throw new Error('AI provider returned an empty response.')
    return text
  } finally {
    clearTimeout(timeout)
  }
}
