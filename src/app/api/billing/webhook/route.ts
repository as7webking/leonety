import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const provider = request.headers.get('x-leonety-billing-provider') ?? 'stripe'
  const eventId = request.headers.get('x-leonety-event-id') ?? crypto.randomUUID()
  const eventType = request.headers.get('x-leonety-event-type') ?? 'placeholder.event'
  const payload = await request.json().catch(() => ({}))

  // Placeholder only. When Stripe/Paddle is connected:
  // 1. verify signature with WEBHOOK_SECRET
  // 2. upsert billing_events
  // 3. upsert billing_customers / billing_subscriptions / billing_payments
  // 4. update app_access with tier='pro', manual_override=false, active=true
  // Keep provider API keys and webhook secrets server-side only.
  return NextResponse.json({
    received: true,
    provider,
    eventId,
    eventType,
    payloadStored: false,
  })
}
