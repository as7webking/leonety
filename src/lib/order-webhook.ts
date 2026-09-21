import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWooWebhookSignature(rawBody: string, signature: string, secret: string) {
  if (!rawBody || !signature || !secret) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  let actual: Buffer
  try {
    actual = Buffer.from(signature, 'base64')
  } catch {
    return false
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function isWooNewOrderTopic(topic: string | null) {
  return topic?.trim().toLowerCase() === 'order.created'
}

export function getWooOrderIdentity(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const rawId = record.id
  if ((typeof rawId !== 'number' && typeof rawId !== 'string') || String(rawId).trim() === '') return null

  const id = String(rawId)
  const number = typeof record.number === 'string' && record.number.trim() ? record.number.trim() : id
  const total = typeof record.total === 'string' || typeof record.total === 'number' ? String(record.total) : ''
  const currency = typeof record.currency === 'string' ? record.currency.trim().slice(0, 8) : ''
  return { id, number: number.slice(0, 80), total: total.slice(0, 40), currency }
}
