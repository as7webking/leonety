import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { deliverIncomingOrderAlert } from '@/lib/order-notifications-server'

export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const admin = createSupabaseAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const { data: due, error } = await admin.from('incoming_order_alert_events')
    .select('id, company_id, external_order_id, order_number, amount, currency, push_attempt_count')
    .neq('acknowledgement_status', 'acknowledged')
    .lt('push_attempt_count', 3)
    .lte('next_push_attempt_at', nowIso)
    .or(`push_claimed_until.is.null,push_claimed_until.lt.${nowIso}`)
    .order('next_push_attempt_at', { ascending: true }).limit(5)
  if (error) return NextResponse.json({ error: 'queue_unavailable' }, { status: 503 })

  let claimed = 0
  let delivered = 0
  for (const event of due ?? []) {
    const { data: claim, error: claimError } = await admin.from('incoming_order_alert_events').update({
      push_claimed_until: new Date(now.getTime() + 2 * 60_000).toISOString(),
      push_attempt_count: event.push_attempt_count + 1,
      last_push_attempt_at: nowIso,
    }).eq('id', event.id).eq('company_id', event.company_id)
      .neq('acknowledgement_status', 'acknowledged')
      .eq('push_attempt_count', event.push_attempt_count)
      .lte('next_push_attempt_at', nowIso)
      .or(`push_claimed_until.is.null,push_claimed_until.lt.${nowIso}`)
      .select('id').maybeSingle()
    if (claimError || !claim) continue
    claimed += 1

    try {
      const result = await deliverIncomingOrderAlert({
        admin,
        eventId: event.id,
        companyId: event.company_id,
        orderId: event.external_order_id,
        orderNumber: event.order_number ?? event.external_order_id,
        amount: event.amount ?? '',
        currency: event.currency ?? '',
        attemptAlreadyClaimed: true,
      })
      if (result.status === 'sent') delivered += 1
    } catch {
      await admin.from('incoming_order_alert_events').update({
        notification_status: 'failed', notification_error_code: 'push_pipeline_failed', push_claimed_until: null,
        next_push_attempt_at: event.push_attempt_count + 1 < 3 ? new Date(now.getTime() + 10 * 60_000).toISOString() : null,
      }).eq('id', event.id).eq('company_id', event.company_id).neq('acknowledgement_status', 'acknowledged')
    }
  }

  return NextResponse.json({ claimed, delivered })
}
