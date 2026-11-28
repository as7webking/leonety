import crypto from 'node:crypto'
import type { BillingProvider } from './plans.ts'

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function parseSignatureParts(header: string, delimiter: string) {
  const values = Object.fromEntries(
    header.split(delimiter).map((part) => {
      const [key, ...value] = part.trim().split('=')
      return [key, value.join('=')]
    })
  )

  return values
}

export function verifyBillingWebhookSignature(
  provider: BillingProvider,
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds = Date.now() / 1000
) {
  if (!signatureHeader || !secret) return false

  const parts = provider === 'stripe'
    ? parseSignatureParts(signatureHeader, ',')
    : parseSignatureParts(signatureHeader, ';')
  const timestamp = provider === 'stripe' ? parts.t : parts.ts
  const signature = provider === 'stripe' ? parts.v1 : parts.h1
  if (!timestamp || !signature) return false

  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) return false

  const signedPayload = provider === 'stripe'
    ? `${timestamp}.${rawBody}`
    : `${timestamp}:${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return timingSafeEqual(expected, signature)
}
