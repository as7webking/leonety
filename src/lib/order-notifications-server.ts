import 'server-only'
import webPush, { type PushSubscription } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createIncomingOrderPushPayload, isPermanentPushFailure, type IncomingOrderPushPayload } from '@/lib/order-notifications'
import type { Locale } from '@/lib/i18n'

interface DeviceRow {
  id: string
  company_id: string
  locale: Locale
  push_endpoint: string
  push_p256dh: string
  push_auth: string
  status: 'enabled' | 'invalid' | 'disabled'
}

function getVapidConfiguration() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.WEB_PUSH_SUBJECT?.trim()
  if (!publicKey || !privateKey || !subject) throw new Error('web_push_not_configured')
  return { publicKey, privateKey, subject }
}

export function getWebPushPublicKey() {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || ''
}

async function sendToDevice(device: DeviceRow, payload: IncomingOrderPushPayload) {
  const vapid = getVapidConfiguration()
  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const subscription: PushSubscription = {
    endpoint: device.push_endpoint,
    keys: { p256dh: device.push_p256dh, auth: device.push_auth },
  }
  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 120,
    urgency: 'high',
  })
}

export async function deliverIncomingOrderAlert(input: {
  admin: SupabaseClient
  eventId: string
  companyId: string
  orderId: string
  orderNumber: string
  amount: string
  currency: string
}) {
  const { data: settings, error: settingsError } = await input.admin
    .from('order_notification_settings')
    .select('enabled, active_device_id')
    .eq('company_id', input.companyId)
    .maybeSingle()
  if (settingsError) throw settingsError

  if (!settings?.enabled || !settings.active_device_id) {
    await input.admin.from('incoming_order_alert_events').update({ notification_status: 'skipped' }).eq('id', input.eventId)
    return { status: 'skipped' as const }
  }

  const { data, error } = await input.admin
    .from('order_notification_devices')
    .select('id, company_id, locale, push_endpoint, push_p256dh, push_auth, status')
    .eq('id', settings.active_device_id)
    .eq('company_id', input.companyId)
    .maybeSingle()
  if (error) throw error
  const device = data as DeviceRow | null

  if (!device || device.status !== 'enabled') {
    await input.admin.from('incoming_order_alert_events').update({
      notification_status: 'skipped', notification_error_code: 'active_device_unavailable',
    }).eq('id', input.eventId)
    return { status: 'skipped' as const }
  }

  const payload = createIncomingOrderPushPayload({
    locale: device.locale,
    companyId: input.companyId,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    amount: input.amount,
    currency: input.currency,
  })

  try {
    await sendToDevice(device, payload)
    await input.admin.from('incoming_order_alert_events').update({
      notification_status: 'sent', notified_device_id: device.id, notified_at: new Date().toISOString(), notification_error_code: null,
    }).eq('id', input.eventId)
    return { status: 'sent' as const, deviceId: device.id }
  } catch (error) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined
    const permanent = isPermanentPushFailure(statusCode)
    if (permanent) {
      await input.admin.from('order_notification_devices').update({
        status: 'invalid', invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', device.id).eq('company_id', input.companyId)
    }
    await input.admin.from('incoming_order_alert_events').update({
      notification_status: 'failed',
      notified_device_id: device.id,
      notification_error_code: permanent ? 'subscription_invalid' : 'push_delivery_failed',
    }).eq('id', input.eventId)
    return { status: 'failed' as const, permanent }
  }
}

export async function sendOrderNotificationTest(device: DeviceRow, companyName: string) {
  const localeCopy: Record<Locale, { title: string; body: string }> = {
    en: { title: 'Leonety test notification', body: `Incoming order alerts are enabled for ${companyName}.` },
    de: { title: 'Leonety-Testbenachrichtigung', body: `Bestellbenachrichtigungen sind für ${companyName} aktiviert.` },
    ru: { title: 'Тестовое уведомление Leonety', body: `Уведомления о заказах включены для ${companyName}.` },
    tr: { title: 'Leonety test bildirimi', body: `${companyName} için sipariş bildirimleri etkin.` },
    uk: { title: 'Тестове сповіщення Leonety', body: `Сповіщення про замовлення ввімкнено для ${companyName}.` },
    pl: { title: 'Powiadomienie testowe Leonety', body: `Powiadomienia o zamówieniach są włączone dla ${companyName}.` },
    fr: { title: 'Notification de test Leonety', body: `Les alertes de commande sont activées pour ${companyName}.` },
  }
  const copy = localeCopy[device.locale] ?? localeCopy.en
  const payload: IncomingOrderPushPayload = {
    type: 'incoming-order', companyId: device.company_id, provider: 'woocommerce', orderId: 'test', orderNumber: 'TEST', amount: '', currency: '', title: copy.title, body: copy.body, url: '/app/settings/integrations/woocommerce',
  }
  return sendToDevice(device, payload)
}
