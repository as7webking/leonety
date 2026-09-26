import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { decryptSecret } from '@/lib/credential-encryption'
import { processVerifiedOrderCreatedEvent } from '@/lib/order-notifications-server'
import { createOrderCreatedEvent } from '@/lib/order-events'
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

  try {
    const result = await processVerifiedOrderCreatedEvent({
      admin,
      event: createOrderCreatedEvent({
        workspaceId: connection.company_id,
        provider: 'woocommerce',
        externalOrderId: order.id,
        providerDeliveryId: request.headers.get('x-wc-webhook-delivery-id'),
        display: { orderNumber: order.number, amount: order.total, currency: order.currency },
      }),
    })
    if (result.status === 'duplicate') return NextResponse.json({ received: true, duplicate: true })
  } catch {
    return NextResponse.json({ received: false }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
