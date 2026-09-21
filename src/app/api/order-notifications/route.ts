import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { getWebPushPublicKey } from '@/lib/order-notifications-server'
import { isOrderNotificationMigrationError, registerOrderDeviceSchema, updateOrderNotificationSchema } from '@/lib/order-notifications'

export const runtime = 'nodejs'

const querySchema = z.object({ companyId: z.string().uuid(), installationId: z.string().uuid().optional() })

function migrationError(error: { code?: string } | null) {
  return NextResponse.json({ error: isOrderNotificationMigrationError(error) ? 'migration_required' : 'notification_settings_failed' }, { status: 500 })
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const [devicesResult, settingsResult, wooResult] = await Promise.all([
    auth.adminSupabase.from('order_notification_devices').select('id, installation_id, device_label, platform, status, last_seen_at, created_at').eq('company_id', parsed.data.companyId).order('last_seen_at', { ascending: false }),
    auth.adminSupabase.from('order_notification_settings').select('enabled, active_device_id, foreground_sound_enabled, foreground_sound_name, foreground_sound_mime').eq('company_id', parsed.data.companyId).maybeSingle(),
    auth.adminSupabase.from('woocommerce_connections').select('id, active, order_webhook_secret, order_webhook_configured_at').eq('company_id', parsed.data.companyId).maybeSingle(),
  ])
  const error = devicesResult.error || settingsResult.error || wooResult.error
  if (error) return migrationError(error)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || new URL(request.url).origin
  const woo = wooResult.data
  return NextResponse.json({
    enabled: Boolean(settingsResult.data?.enabled),
    activeDeviceId: settingsResult.data?.active_device_id ?? null,
    devices: (devicesResult.data ?? []).map((device) => ({
      id: device.id,
      label: device.device_label,
      platform: device.platform,
      status: device.status,
      lastSeenAt: device.last_seen_at,
      isCurrent: device.installation_id === parsed.data.installationId,
    })),
    sound: {
      enabled: settingsResult.data?.foreground_sound_enabled ?? true,
      hasCustom: Boolean(settingsResult.data?.foreground_sound_name),
      name: settingsResult.data?.foreground_sound_name ?? '',
      mime: settingsResult.data?.foreground_sound_mime ?? '',
    },
    wooCommerce: {
      connected: Boolean(woo?.active),
      webhookConfigured: Boolean(woo?.order_webhook_secret),
      webhookUrl: woo?.id ? `${siteUrl}/api/webhooks/woocommerce/orders/${woo.id}` : '',
      configuredAt: woo?.order_webhook_configured_at ?? null,
    },
    vapidPublicKey: getWebPushPublicKey(),
  })
}

export async function POST(request: Request) {
  const parsed = registerOrderDeviceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const now = new Date().toISOString()
  const { data: device, error: deviceError } = await auth.adminSupabase.from('order_notification_devices').upsert({
    company_id: parsed.data.companyId,
    user_id: auth.user.id,
    installation_id: parsed.data.installationId,
    device_label: parsed.data.deviceLabel,
    platform: parsed.data.platform,
    locale: parsed.data.locale,
    push_endpoint: parsed.data.subscription.endpoint,
    push_p256dh: parsed.data.subscription.keys.p256dh,
    push_auth: parsed.data.subscription.keys.auth,
    status: 'enabled',
    invalidated_at: null,
    last_seen_at: now,
    updated_at: now,
  }, { onConflict: 'company_id,installation_id' }).select('id').single()
  if (deviceError) return migrationError(deviceError)

  const { error: settingsError } = await auth.adminSupabase.from('order_notification_settings').upsert({
    company_id: parsed.data.companyId,
    active_device_id: device.id,
    enabled: true,
    updated_by: auth.user.id,
    updated_at: now,
  }, { onConflict: 'company_id' })
  if (settingsError) return migrationError(settingsError)

  return NextResponse.json({ ok: true, deviceId: device.id })
}

export async function PATCH(request: Request) {
  const parsed = updateOrderNotificationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  if (parsed.data.action === 'select_device') {
    const { data: device, error } = await auth.adminSupabase.from('order_notification_devices').select('id').eq('id', parsed.data.deviceId).eq('company_id', parsed.data.companyId).eq('status', 'enabled').maybeSingle()
    if (error) return migrationError(error)
    if (!device) return NextResponse.json({ error: 'device_not_available' }, { status: 404 })

    const { error: updateError } = await auth.adminSupabase.from('order_notification_settings').upsert({
      company_id: parsed.data.companyId, active_device_id: device.id, enabled: true, updated_by: auth.user.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    if (updateError) return migrationError(updateError)
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.action === 'set_sound_enabled') {
    const { error } = await auth.adminSupabase.from('order_notification_settings').upsert({
      company_id: parsed.data.companyId,
      foreground_sound_enabled: parsed.data.enabled,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    if (error) return migrationError(error)
    return NextResponse.json({ ok: true })
  }

  const { error } = await auth.adminSupabase.from('order_notification_settings').upsert({
    company_id: parsed.data.companyId, enabled: false, updated_by: auth.user.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id' })
  if (error) return migrationError(error)
  return NextResponse.json({ ok: true })
}
