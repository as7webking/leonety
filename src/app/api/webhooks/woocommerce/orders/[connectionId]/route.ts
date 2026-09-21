import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { decryptSecret } from '@/lib/credential-encryption'
import { deliverIncomingOrderAlert } from '@/lib/order-notifications-server'
import { getWooOrderIdentity, isWooNewOrderTopic, verifyWooWebhookSignature } from '@/lib/order-webhook'

export const runtime = 'nodejs'
const MAX_WEBHOOK_BYTES = 1024 * 1024

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await context.params
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ received: false }, { status: 413 })

  const admin = createSupabaseAdminClient()
  const { data: connection, error: connectionError } = await admin.from('woocommerce_connections').select('id, company_id, active, order_webhook_secret').eq('id', connectionId).maybeSingle()
  if (connectionError || !connection?.active || !connection.order_webhook_secret) return NextResponse.json({ received: false }, { status: 404 })

  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) return NextResponse.json({ received: false }, { status: 413 })
  const signature = request.headers.get('x-wc-webhook-signature') || ''
  if (!verifyWooWebhookSignature(rawBody, signature, decryptSecret(connection.order_webhook_secret))) {
    return NextResponse.json({ received: false }, { status: 401 })
  }

  if (!isWooNewOrderTopic(request.headers.get('x-wc-webhook-topic'))) {
    return NextResponse.json({ received: true, ignored: true })
  }

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ received: false }, { status: 400 }) }
  const order = getWooOrderIdentity(payload)
  if (!order) return NextResponse.json({ received: false }, { status: 400 })

  const { data: event, error: insertError } = await admin.from('incoming_order_alert_events').insert({
    company_id: connection.company_id,
    provider: 'woocommerce',
    external_order_id: order.id,
    event_type: 'order.created',
    provider_delivery_id: request.headers.get('x-wc-webhook-delivery-id'),
    order_number: order.number,
    amount: order.total,
    currency: order.currency,
  }).select('id').single()

  if (insertError?.code === '23505') return NextResponse.json({ received: true, duplicate: true })
  if (insertError || !event) return NextResponse.json({ received: false }, { status: 500 })

  // Push delivery is deliberately outside order-event acceptance. A failed push is
  // recorded, but the verified webhook still succeeds and will not be retried/ring twice.
  try {
    await deliverIncomingOrderAlert({ admin, eventId: event.id, companyId: connection.company_id, orderId: order.id, orderNumber: order.number, amount: order.total, currency: order.currency })
  } catch {
    await admin.from('incoming_order_alert_events').update({ notification_status: 'failed', notification_error_code: 'push_pipeline_failed' }).eq('id', event.id)
  }

  return NextResponse.json({ received: true })
}
