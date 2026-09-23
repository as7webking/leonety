import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isOrderNotificationMigrationError, registerOrderDeviceSchema } from '@/lib/order-notifications'
import { getWebPushPublicKey } from '@/lib/order-notifications-server'

export const runtime = 'nodejs'

const currentDeviceSchema = z.object({
  companyId: z.string().uuid(),
  installationId: z.string().uuid(),
})

function settingsError(error: { code?: string } | null | undefined) {
  return NextResponse.json({
    error: isOrderNotificationMigrationError(error) ? 'migration_required' : 'notification_settings_failed',
  }, { status: 500 })
}

export async function GET(request: Request) {
  const parsed = currentDeviceSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.adminSupabase
    .from('order_notification_devices')
    .select('id, device_label, platform, status, last_seen_at')
    .eq('company_id', parsed.data.companyId)
    .eq('user_id', auth.user.id)
    .eq('installation_id', parsed.data.installationId)
    .maybeSingle()

  if (error) return settingsError(error)

  return NextResponse.json({
    configured: Boolean(getWebPushPublicKey()),
    vapidPublicKey: getWebPushPublicKey(),
    device: data ? {
      id: data.id,
      label: data.device_label,
      platform: data.platform,
      status: data.status,
      lastSeenAt: data.last_seen_at,
    } : null,
  })
}

export async function POST(request: Request) {
  const parsed = registerOrderDeviceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const now = new Date().toISOString()
  const { data, error } = await auth.adminSupabase
    .from('order_notification_devices')
    .upsert({
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
    }, { onConflict: 'company_id,installation_id' })
    .select('id')
    .single()

  if (error) return settingsError(error)
  return NextResponse.json({ ok: true, deviceId: data.id })
}

export async function DELETE(request: Request) {
  const parsed = currentDeviceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: device, error: deviceError } = await auth.adminSupabase
    .from('order_notification_devices')
    .select('id')
    .eq('company_id', parsed.data.companyId)
    .eq('user_id', auth.user.id)
    .eq('installation_id', parsed.data.installationId)
    .maybeSingle()

  if (deviceError) return settingsError(deviceError)
  if (!device) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()
  const { error: disableError } = await auth.adminSupabase
    .from('order_notification_devices')
    .update({ status: 'disabled', updated_at: now })
    .eq('id', device.id)
    .eq('company_id', parsed.data.companyId)
    .eq('user_id', auth.user.id)

  if (disableError) return settingsError(disableError)

  const { data: orderSettings, error: orderSettingsError } = await auth.adminSupabase
    .from('order_notification_settings')
    .select('active_device_id')
    .eq('company_id', parsed.data.companyId)
    .maybeSingle()

  if (orderSettingsError && !isOrderNotificationMigrationError(orderSettingsError)) return settingsError(orderSettingsError)
  if (orderSettings?.active_device_id === device.id) {
    const { error } = await auth.adminSupabase
      .from('order_notification_settings')
      .update({ active_device_id: null, enabled: false, updated_by: auth.user.id, updated_at: now })
      .eq('company_id', parsed.data.companyId)
    if (error) return settingsError(error)
  }

  return NextResponse.json({ ok: true })
}
