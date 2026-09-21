import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isPermanentPushFailure } from '@/lib/order-notifications'
import { sendOrderNotificationTest } from '@/lib/order-notifications-server'

export const runtime = 'nodejs'

const schema = z.object({ companyId: z.string().uuid() })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: settings, error: settingsError } = await auth.adminSupabase.from('order_notification_settings').select('enabled, active_device_id').eq('company_id', parsed.data.companyId).maybeSingle()
  if (settingsError) return NextResponse.json({ error: 'notification_settings_failed' }, { status: 500 })
  if (!settings?.enabled || !settings.active_device_id) return NextResponse.json({ error: 'no_active_device' }, { status: 409 })

  const { data: device, error } = await auth.adminSupabase.from('order_notification_devices').select('id, company_id, locale, push_endpoint, push_p256dh, push_auth, status').eq('id', settings.active_device_id).eq('company_id', parsed.data.companyId).maybeSingle()
  if (error || !device || device.status !== 'enabled') return NextResponse.json({ error: 'device_not_available' }, { status: 409 })

  const { data: company } = await auth.adminSupabase.from('companies').select('name').eq('id', parsed.data.companyId).maybeSingle()

  try {
    await sendOrderNotificationTest(device, company?.name || 'Leonety')
    return NextResponse.json({ ok: true })
  } catch (pushError) {
    const statusCode = pushError && typeof pushError === 'object' && 'statusCode' in pushError ? Number((pushError as { statusCode?: unknown }).statusCode) : undefined
    if (isPermanentPushFailure(statusCode)) {
      await auth.adminSupabase.from('order_notification_devices').update({ status: 'invalid', invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', device.id).eq('company_id', parsed.data.companyId)
    }
    return NextResponse.json({ error: isPermanentPushFailure(statusCode) ? 'subscription_invalid' : 'test_delivery_failed' }, { status: 502 })
  }
}
