import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { isPermanentPushFailure } from '@/lib/order-notifications'
import { sendOrderNotificationTest } from '@/lib/order-notifications-server'

export const runtime = 'nodejs'

const schema = z.object({ companyId: z.string().uuid(), installationId: z.string().uuid() })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: device, error } = await auth.adminSupabase.from('order_notification_devices').select('id, company_id, locale, push_endpoint, push_p256dh, push_auth, status').eq('installation_id', parsed.data.installationId).eq('company_id', parsed.data.companyId).maybeSingle()
  if (error || !device || device.status !== 'enabled') return NextResponse.json({ error: 'device_not_available' }, { status: 409 })

  const { data: company } = await auth.adminSupabase.from('companies').select('name').eq('id', parsed.data.companyId).maybeSingle()

  try {
    await sendOrderNotificationTest(device, company?.name || 'Leonety')
    const { error: diagnosticsError } = await auth.adminSupabase.from('order_notification_settings').upsert({
      company_id: parsed.data.companyId, last_test_at: new Date().toISOString(), last_test_status: 'request_accepted', updated_by: auth.user.id,
    }, { onConflict:'company_id' })
    return NextResponse.json({ pushRequestAccepted: true, receiptConfirmed: false, acknowledgementTest: 'local_only', diagnosticsUpdated: !diagnosticsError })
  } catch (pushError) {
    const statusCode = pushError && typeof pushError === 'object' && 'statusCode' in pushError ? Number((pushError as { statusCode?: unknown }).statusCode) : undefined
    if (isPermanentPushFailure(statusCode)) {
      await auth.adminSupabase.from('order_notification_devices').update({ status: 'invalid', invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', device.id).eq('company_id', parsed.data.companyId)
    }
    await auth.adminSupabase.from('order_notification_settings').upsert({ company_id:parsed.data.companyId, last_test_at:new Date().toISOString(), last_test_status:'failed', updated_by:auth.user.id }, { onConflict:'company_id' })
    return NextResponse.json({ error: isPermanentPushFailure(statusCode) ? 'subscription_invalid' : 'test_delivery_failed' }, { status: 502 })
  }
}
