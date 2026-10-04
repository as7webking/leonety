import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getEmailRuntimeConfig } from './email/config.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { sendWithResend } from './email/providers/resend.ts'
import type { EmailMessage, EmailProviderConfig } from './email/types'

const config: EmailProviderConfig = {
  apiKey: 'test-key',
  from: 'Leonety <noreply@example.com>',
  defaultReplyTo: 'support@example.com',
  productName: 'Leonety',
  appUrl: 'https://example.com',
}

const message: EmailMessage = {
  to: 'admin@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
  text: 'Test',
  category: 'upgrade_request',
  idempotencyKey: 'upgrade-request/one',
}

function response(status: number, body: object = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

test('validates required server email configuration without exposing defaults', () => {
  assert.deepEqual(getEmailRuntimeConfig({}), { ok: false, code: 'configuration_missing' })
  const runtime = getEmailRuntimeConfig({
    EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'secret', EMAIL_FROM: config.from,
    EMAIL_REPLY_TO: config.defaultReplyTo!, NEXT_PUBLIC_SITE_URL: config.appUrl,
  })
  assert.equal(runtime.ok, true)
})

test('sends valid delivery through the Resend API with idempotency', async () => {
  let request: RequestInit | undefined
  const result = await sendWithResend(message, config, {
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      request = init
      return response(200, { id: 'email-id' })
    }) as typeof fetch,
  })
  assert.deepEqual(result, { ok: true, providerMessageId: 'email-id' })
  assert.equal((request?.headers as Record<string, string>)['Idempotency-Key'], 'upgrade-request/one')
})

test('rejects an invalid recipient before provider delivery', async () => {
  let called = false
  const result = await sendWithResend({ ...message, to: 'invalid' }, config, {
    fetchImpl: (async () => { called = true; return response(200) }) as typeof fetch,
  })
  assert.deepEqual(result, { ok: false, code: 'invalid_recipient' })
  assert.equal(called, false)
})

test('classifies provider credential, rate-limit and availability failures', async () => {
  for (const [status, code] of [[401, 'provider_auth_failed'], [429, 'rate_limited'], [503, 'provider_unavailable']] as const) {
    const result = await sendWithResend(message, config, { fetchImpl: (async () => response(status)) as typeof fetch })
    assert.deepEqual(result, { ok: false, code })
  }
})

test('classifies aborted provider requests as timeout', async () => {
  const error = new Error('aborted')
  error.name = 'AbortError'
  const result = await sendWithResend(message, config, {
    fetchImpl: (async () => { throw error }) as typeof fetch,
  })
  assert.deepEqual(result, { ok: false, code: 'timeout' })
})

test('rejects a malformed successful provider response', async () => {
  const result = await sendWithResend(message, config, {
    fetchImpl: (async () => response(200, {})) as typeof fetch,
  })
  assert.deepEqual(result, { ok: false, code: 'unknown_error' })
})

test('upgrade request template covers all locales and escapes user content', () => {
  const template = readFileSync(new URL('./email/templates/upgrade-request.ts', import.meta.url), 'utf8')
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']) {
    assert.match(template, new RegExp(`\\n  ${locale}: \\{`))
  }
  assert.match(template, /escapeHtml\(value\)/)
  assert.match(template, /escapeHtml\(input\.companyName\)|escapeHtml\(value\)/)
})
