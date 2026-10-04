import type { EmailErrorCode, EmailProviderConfig } from './types'

export type EmailRuntimeConfig =
  | { ok: true; provider: 'resend'; config: EmailProviderConfig }
  | { ok: false; code: EmailErrorCode }

const simpleEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function extractMailbox(value: string) {
  const trimmed = value.trim()
  const displayAddress = trimmed.match(/<([^<>]+)>$/)?.[1]?.trim()
  return displayAddress ?? trimmed
}

export function isValidEmailAddress(value: string) {
  return simpleEmailPattern.test(extractMailbox(value))
}

export function getEmailRuntimeConfig(env: Record<string, string | undefined> = process.env): EmailRuntimeConfig {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase()
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()
  const replyTo = env.EMAIL_REPLY_TO?.trim() || null
  const productName = env.EMAIL_PRODUCT_NAME?.trim() || 'Leonety'
  const appUrl = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')

  if (provider !== 'resend' || !apiKey || !from || !appUrl) {
    return { ok: false, code: 'configuration_missing' }
  }

  if (!isValidEmailAddress(from) || (replyTo && !isValidEmailAddress(replyTo))) {
    return { ok: false, code: 'configuration_missing' }
  }

  return {
    ok: true,
    provider: 'resend',
    config: {
      apiKey,
      from,
      defaultReplyTo: replyTo,
      productName,
      appUrl,
    },
  }
}
