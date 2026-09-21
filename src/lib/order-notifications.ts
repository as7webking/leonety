import { z } from 'zod'
import type { Locale } from '@/lib/i18n'

export const ORDER_ALERT_SOUND_BUCKET = 'order-alert-sounds'
export const ORDER_ALERT_SOUND_MAX_BYTES = 2 * 1024 * 1024
export const ORDER_ALERT_SOUND_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav'] as const

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS endpoint required'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
})

export const registerOrderDeviceSchema = z.object({
  companyId: z.string().uuid(),
  installationId: z.string().uuid(),
  deviceLabel: z.string().trim().min(1).max(80),
  platform: z.string().trim().min(1).max(40),
  locale: z.enum(['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']),
  subscription: pushSubscriptionSchema,
})

export const updateOrderNotificationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('select_device'), companyId: z.string().uuid(), deviceId: z.string().uuid() }),
  z.object({ action: z.literal('set_sound_enabled'), companyId: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal('disable'), companyId: z.string().uuid() }),
])

export interface IncomingOrderPushPayload {
  type: 'incoming-order'
  companyId: string
  provider: 'woocommerce'
  orderId: string
  orderNumber: string
  amount: string
  currency: string
  title: string
  body: string
  url: string
}

const pushCopy: Record<Locale, { title: string; order: string }> = {
  en: { title: 'New order', order: 'Order' },
  de: { title: 'Neue Bestellung', order: 'Bestellung' },
  ru: { title: 'Новый заказ', order: 'Заказ' },
  tr: { title: 'Yeni sipariş', order: 'Sipariş' },
  uk: { title: 'Нове замовлення', order: 'Замовлення' },
  pl: { title: 'Nowe zamówienie', order: 'Zamówienie' },
  fr: { title: 'Nouvelle commande', order: 'Commande' },
}

export function createIncomingOrderPushPayload(input: {
  locale: Locale
  companyId: string
  orderId: string
  orderNumber: string
  amount: string
  currency: string
}): IncomingOrderPushPayload {
  const copy = pushCopy[input.locale] ?? pushCopy.en
  const amount = input.amount && input.currency ? `${input.amount} ${input.currency}` : ''
  return {
    type: 'incoming-order',
    companyId: input.companyId,
    provider: 'woocommerce',
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    amount: input.amount,
    currency: input.currency,
    title: copy.title,
    body: ['WooCommerce', `${copy.order} #${input.orderNumber}`, amount].filter(Boolean).join(' · '),
    url: '/app/settings/integrations/woocommerce',
  }
}

export function isPermanentPushFailure(statusCode: number | undefined) {
  return statusCode === 404 || statusCode === 410
}

export function isOrderNotificationMigrationError(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === '42703' || error?.code === 'PGRST204' || error?.code === 'PGRST205'
}

export function sanitizeSoundFilename(filename: string) {
  const normalized = filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return normalized.replace(/^[-.]+|[-.]+$/g, '').slice(0, 100) || 'order-alert'
}

export function detectAudioType(bytes: Uint8Array, declaredType: string) {
  const isWav = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WAVE'
  if (isWav && (declaredType === 'audio/wav' || declaredType === 'audio/x-wav')) return 'audio/wav'

  const isId3 = bytes.length >= 3 && String.fromCharCode(...bytes.slice(0, 3)) === 'ID3'
  const isMp3Frame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  if ((isId3 || isMp3Frame) && declaredType === 'audio/mpeg') return 'audio/mpeg'

  return null
}
