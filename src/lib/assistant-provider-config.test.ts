import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const providerSource = readFileSync(new URL('./ai-provider.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../app/api/assistant/route.ts', import.meta.url), 'utf8')

test('keeps provider credentials server-only with the documented OpenAI fallback', () => {
  assert.match(providerSource, /process\.env\.AI_API_KEY/)
  assert.match(providerSource, /process\.env\.OPENAI_API_KEY/)
  assert.match(providerSource, /process\.env\.AI_MODEL/)
  assert.match(providerSource, /process\.env\.AI_PROVIDER/)
  assert.doesNotMatch(providerSource, /NEXT_PUBLIC_[A-Z_]*(AI|OPENAI)/)
})

test('returns stable public error codes without exposing provider payloads', () => {
  for (const code of [
    'configuration_missing',
    'provider_auth_failed',
    'rate_limited',
    'provider_unavailable',
    'invalid_model',
    'request_timeout',
    'invalid_response',
    'internal_error',
  ]) {
    assert.match(`${providerSource}\n${routeSource}`, new RegExp(code))
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
