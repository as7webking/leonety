import 'server-only'

import {
  AiProviderError,
  type AiProvider,
  type AiProviderErrorCode,
  type AiProviderName,
  type GenerateAiTextInput,
  type GenerateAiVisionJsonInput,
} from '@/lib/ai-provider-contract'
import { getOpenAiModelName, openAiProvider } from '@/lib/ai-providers/openai'

export {
  AiProviderError,
  type AiProvider,
  type AiProviderCapabilities,
  type AiProviderConfigurationStatus,
  type AiProviderErrorCode,
  type AiProviderHealth,
  type AiProviderName,
  type GenerateAiTextInput,
  type GenerateAiVisionJsonInput,
} from '@/lib/ai-provider-contract'

const providerRegistry: Record<AiProviderName, AiProvider> = {
  openai: openAiProvider,
}

function getRequestedProviderName() {
  return process.env.AI_PROVIDER?.trim().toLowerCase() || 'openai'
}

export function getAiProviderName(): AiProviderName {
  const requested = getRequestedProviderName()
  if (requested in providerRegistry) return requested as AiProviderName
  throw new AiProviderError('provider_unsupported')
}

export function getAiModelName() {
  return getOpenAiModelName()
}

function getAiProviderAdapter(): AiProvider {
  return providerRegistry[getAiProviderName()]
}

export function getAiProviderCapabilities() {
  return getAiProviderAdapter().capabilities
}

export function getAiConfigurationStatus(): {
  provider: string
  model: string
  configured: boolean
  error?: AiProviderErrorCode
} {
  const requested = getRequestedProviderName()
  if (!(requested in providerRegistry)) {
    return {
      provider: requested,
      model: getAiModelName(),
      configured: false,
      error: 'provider_unsupported',
    }
  }
  return providerRegistry[requested as AiProviderName].validateConfiguration()
}

export async function getAiProviderHealth() {
  return getAiProviderAdapter().healthCheck()
}

export async function generateAiText({ instructions, input, maxOutputTokens = 900, responseFormat = 'text' }: GenerateAiTextInput) {
  return getAiProviderAdapter().generate({ instructions, input, maxOutputTokens, responseFormat })
}

export async function classifyAiText(input: GenerateAiTextInput) {
  return getAiProviderAdapter().classify(input)
}

export async function generateAiVisionJson(input: GenerateAiVisionJsonInput) {
  const provider = getAiProviderAdapter()
  if (!provider.capabilities.vision || !provider.generateVisionJson) {
    throw new AiProviderError('configuration_missing')
  }
  return provider.generateVisionJson(input)
}
