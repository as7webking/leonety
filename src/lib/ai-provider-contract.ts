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
  | 'provider_unsupported'
  | 'provider_auth_failed'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'provider_unavailable'
  | 'invalid_model'
  | 'request_timeout'
  | 'incomplete_response'
  | 'invalid_response'

export interface AiProviderDiagnostics {
  httpStatus?: number
  providerErrorType?: string
  providerErrorCode?: string
  failureKind?: 'timeout' | 'network' | 'http'
  incompleteResponse?: boolean
}

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode, public readonly diagnostics: AiProviderDiagnostics = {}) {
    super(code)
    this.name = 'AiProviderError'
  }
}

export interface AiProviderConfigurationStatus {
  provider: AiProviderName
  model: string
  configured: boolean
  error?: AiProviderErrorCode
}

export interface AiProviderHealth {
  provider: AiProviderName
  model: string
  ready: boolean
  error?: AiProviderErrorCode
}

export interface AiProvider {
  readonly name: AiProviderName
  readonly capabilities: AiProviderCapabilities
  validateConfiguration: () => AiProviderConfigurationStatus
  healthCheck: () => Promise<AiProviderHealth>
  generate: (input: GenerateAiTextInput) => Promise<string>
  classify: (input: GenerateAiTextInput) => Promise<string>
  generateVisionJson?: (input: GenerateAiVisionJsonInput) => Promise<string>
}

