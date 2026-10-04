import type { EmailMessage, EmailProviderConfig, EmailSendResult } from '../types'

interface ResendResponse {
  id?: string
}

function isValidEmailAddress(value: string) {
  const trimmed = value.trim()
  const mailbox = trimmed.match(/<([^<>]+)>$/)?.[1]?.trim() ?? trimmed
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)
}

function classifyProviderStatus(status: number): EmailSendResult {
  if (status === 401 || status === 403) return { ok: false, code: 'provider_auth_failed' }
  if (status === 429) return { ok: false, code: 'rate_limited' }
  if (status === 408 || status === 504) return { ok: false, code: 'timeout' }
  if (status >= 500) return { ok: false, code: 'provider_unavailable' }
  return { ok: false, code: 'unknown_error' }
}

export async function sendWithResend(
  message: EmailMessage,
  config: EmailProviderConfig,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<EmailSendResult> {
  if (!isValidEmailAddress(message.to) || (message.replyTo && !isValidEmailAddress(message.replyTo))) {
    return { ok: false, code: 'invalid_recipient' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)

  try {
    const response = await (options.fetchImpl ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo || config.defaultReplyTo || undefined,
        tags: [{ name: 'category', value: message.category }],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) return classifyProviderStatus(response.status)

    const payload = await response.json().catch(() => ({})) as ResendResponse
    if (typeof payload.id !== 'string' || !payload.id) return { ok: false, code: 'unknown_error' }
    return { ok: true, providerMessageId: payload.id }
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { ok: false, code: 'timeout' }
    }
    return { ok: false, code: 'provider_unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}
