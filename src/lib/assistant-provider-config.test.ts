import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const providerSource = readFileSync(new URL('./ai-provider.ts', import.meta.url), 'utf8')
const contractSource = readFileSync(new URL('./ai-provider-contract.ts', import.meta.url), 'utf8')
const openAiSource = readFileSync(new URL('./ai-providers/openai.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')

test('keeps provider credentials server-only with the documented OpenAI fallback', () => {
  assert.match(openAiSource, /process\.env\.AI_API_KEY/)
  assert.match(openAiSource, /process\.env\.OPENAI_API_KEY/)
  assert.match(openAiSource, /process\.env\.AI_MODEL/)
  assert.match(providerSource, /process\.env\.AI_PROVIDER/)
  assert.match(openAiSource, /import 'server-only'/)
  assert.doesNotMatch(`${providerSource}\n${openAiSource}`, /NEXT_PUBLIC_[A-Z_]*(AI|OPENAI)/)
})

test('keeps OpenAI Responses API behavior behind the provider contract', () => {
  for (const member of ['generate:', 'classify:', 'healthCheck:', 'validateConfiguration:']) {
    assert.match(contractSource, new RegExp(member))
  }
  assert.match(providerSource, /providerRegistry[\s\S]*openai: openAiProvider/)
  assert.match(providerSource, /provider_unsupported/)
  assert.match(openAiSource, /https:\/\/api\.openai\.com\/v1\/responses/)
  assert.match(openAiSource, /'gpt-5-mini'/)
  assert.match(openAiSource, /max_output_tokens: maxOutputTokens/)
  assert.match(openAiSource, /setTimeout\(\(\) => controller\.abort\(\), 25_000\)/)
  assert.match(openAiSource, /setTimeout\(\(\) => controller\.abort\(\), 35_000\)/)
})

test('returns stable public error codes without exposing provider payloads', () => {
  for (const code of [
    'configuration_missing',
    'provider_unsupported',
    'provider_auth_failed',
    'rate_limited',
    'provider_unavailable',
    'invalid_model',
    'request_timeout',
    'invalid_response',
    'internal_error',
  ]) {
    assert.match(`${contractSource}\n${openAiSource}\n${routeSource}`, new RegExp(code))
  }
  assert.doesNotMatch(routeSource, /error\.message[),}]/)
})

test('authenticates before loading controlled workspace context or calling AI', () => {
  const authCheck = routeSource.indexOf('if (authError || !authData.user)')
  const dataLoad = routeSource.indexOf('loadAuthorizedAssistantData({')
  const providerCall = routeSource.indexOf('await generateAiText({')

  assert.ok(authCheck > -1)
  assert.ok(dataLoad > authCheck)
  assert.ok(providerCall > dataLoad)
})
