import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { encryptSecret } from '@/lib/credential-encryption'

export const runtime = 'nodejs'

const schema = z.object({ companyId: z.string().uuid() })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: connection, error: connectionError } = await auth.adminSupabase.from('woocommerce_connections').select('id, active').eq('company_id', parsed.data.companyId).maybeSingle()
  if (connectionError) return NextResponse.json({ error: 'webhook_setup_failed' }, { status: 500 })
  if (!connection?.active) return NextResponse.json({ error: 'woocommerce_not_connected' }, { status: 409 })

  const secret = randomBytes(32).toString('base64url')
  const now = new Date().toISOString()
  const { error } = await auth.adminSupabase.from('woocommerce_connections').update({ order_webhook_secret: encryptSecret(secret), order_webhook_configured_at: now }).eq('id', connection.id).eq('company_id', parsed.data.companyId)
  if (error) return NextResponse.json({ error: error.code === '42703' || error.code === 'PGRST204' ? 'migration_required' : 'webhook_setup_failed' }, { status: 500 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || new URL(request.url).origin
  return NextResponse.json({ webhookUrl: `${siteUrl}/api/webhooks/woocommerce/orders/${connection.id}`, secret, configuredAt: now })
}
