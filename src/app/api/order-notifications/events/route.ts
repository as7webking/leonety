import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'

export const runtime = 'nodejs'

const querySchema = z.object({ companyId: z.string().uuid(), eventId: z.string().uuid().optional() })
const updateSchema = z.object({ companyId: z.string().uuid(), eventId: z.string().uuid(), action: z.enum(['seen', 'acknowledge']) })

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.adminSupabase.from('incoming_order_alert_events')
    .select('id, provider, external_order_id, order_number, amount, currency, created_at, acknowledgement_status')
    .eq('company_id', parsed.data.companyId)
    .neq('acknowledgement_status', 'acknowledged')
    .order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: 'events_unavailable' }, { status: 503 })

  const ids = (data ?? []).filter((event) => event.acknowledgement_status === 'new' || event.acknowledgement_status === 'notified').map((event) => event.id)
  if (ids.length) {
    const { error: seenError } = await auth.adminSupabase.from('incoming_order_alert_events')
      .update({ acknowledgement_status: 'seen' }).eq('company_id', parsed.data.companyId).in('id', ids).neq('acknowledgement_status', 'acknowledged')
    if (seenError) return NextResponse.json({ error: 'events_unavailable' }, { status: 503 })
  }
  let activeAcknowledged = false
  if (parsed.data.eventId) {
    const { data: active, error: activeError } = await auth.adminSupabase.from('incoming_order_alert_events')
      .select('acknowledgement_status').eq('company_id', parsed.data.companyId).eq('id', parsed.data.eventId).maybeSingle()
    if (activeError) return NextResponse.json({ error: 'events_unavailable' }, { status: 503 })
    activeAcknowledged = !active || active.acknowledgement_status === 'acknowledged'
  }
  return NextResponse.json({ activeAcknowledged, events: (data ?? []).map((event) => ({ ...event, acknowledgementStatus: event.acknowledgement_status === 'new' || event.acknowledgement_status === 'notified' ? 'seen' : event.acknowledgement_status })) })
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const now = new Date().toISOString()
  const values = parsed.data.action === 'acknowledge'
    ? { acknowledgement_status: 'acknowledged', acknowledged_at: now, acknowledged_by: auth.user.id, next_push_attempt_at: null, push_claimed_until: null }
    : { acknowledgement_status: 'seen' }
  const { data, error } = await auth.adminSupabase.from('incoming_order_alert_events').update(values)
    .eq('company_id', parsed.data.companyId).eq('id', parsed.data.eventId).neq('acknowledgement_status', 'acknowledged')
    .select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'event_update_failed' }, { status: 503 })
  return NextResponse.json({ ok: true, updated: Boolean(data), acknowledgementStatus: parsed.data.action === 'acknowledge' ? 'acknowledged' : 'seen' })
}
