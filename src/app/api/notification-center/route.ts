import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { buildNotificationEvents } from '@/lib/notification-center'

export const runtime = 'nodejs'

const pageSize = 1000
const maxRowsPerSource = 10_000
const workspaceSchema = z.object({ companyId: z.string().uuid() })
const actionSchema = z.object({
  companyId: z.string().uuid(),
  action: z.enum(['read', 'unread', 'read_all']),
  notificationId: z.string().min(1).max(512).optional(),
}).refine((value) => value.action === 'read_all' || Boolean(value.notificationId), { path: ['notificationId'] })

type PageResult<T> = { data: T[] | null; error: unknown }

async function readAllPages<T>(queryPage: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = []
  for (let from = 0; from < maxRowsPerSource; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) throw new Error('notification_source_unavailable')
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
  throw new Error('notification_source_too_large')
}

async function getWorkspaceAccess(companyId: string) {
  const sessionClient = await createServerSupabaseClient()
  const { data, error } = await sessionClient.auth.getUser()
  if (error || !data.user) return { response: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }

  const admin = createSupabaseAdminClient()
  const { data: company, error: companyError } = await admin
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', data.user.id)
    .maybeSingle()
  if (companyError) return { response: NextResponse.json({ error: 'workspace_check_failed' }, { status: 503 }) }
  if (!company) return { response: NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 }) }
  return { user: data.user, admin }
}

async function loadEvents(admin: ReturnType<typeof createSupabaseAdminClient>, companyId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const [invoices, products, syncs, mailboxes, integrations] = await Promise.all([
    readAllPages((from, to) => admin.from('invoices')
      .select('id, invoice_number, client_id, due_date, created_at')
      .eq('company_id', companyId)
      .in('status', ['sent', 'overdue'])
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .order('id')
      .range(from, to)),
    readAllPages((from, to) => admin.from('products')
      .select('id, name, current_stock, low_stock_threshold, updated_at')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('name')
      .order('id')
      .range(from, to)),
    readAllPages((from, to) => admin.from('product_syncs')
      .select('product_id, updated_at')
      .eq('company_id', companyId)
      .eq('channel', 'woocommerce')
      .eq('sync_status', 'failed')
      .order('updated_at', { ascending: false })
      .order('product_id')
      .range(from, to)),
    readAllPages((from, to) => admin.from('mailbox_connections')
      .select('id, provider, provider_account_email, status, updated_at')
      .eq('company_id', companyId)
      .in('status', ['reconnect_required', 'error'])
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, to)),
    readAllPages((from, to) => admin.from('store_integrations')
      .select('id, provider, store_name, updated_at')
      .eq('company_id', companyId)
      .eq('status', 'error')
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, to)),
  ])

  const clientIds = [...new Set(invoices.map((invoice) => invoice.client_id).filter((id): id is string => Boolean(id)))]
  const clients = clientIds.length === 0
    ? []
    : await readAllPages((from, to) => admin.from('clients')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', clientIds)
      .range(from, to))

  return buildNotificationEvents({
    workspaceId: companyId,
    invoices,
    clients,
    products,
    failedWooSyncs: syncs,
    mailboxes,
    integrations,
  })
}

function isMissingNotificationSchema(error: unknown) {
  return Boolean(error && typeof error === 'object' && ['42P01', 'PGRST205'].includes(String((error as { code?: unknown }).code ?? '')))
}

function apiError(error: unknown) {
  return NextResponse.json({ error: isMissingNotificationSchema(error) ? 'migration_required' : 'notification_load_failed' }, { status: 503 })
}

export async function GET(request: Request) {
  const parsed = workspaceSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await getWorkspaceAccess(parsed.data.companyId)
  if ('response' in access) return access.response

  try {
    const events = await loadEvents(access.admin, parsed.data.companyId)
    const ids = events.map((event) => event.id)
    if (ids.length === 0) return NextResponse.json({ notifications: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
    const { data, error } = await access.admin.from('notification_read_states')
      .select('notification_key, is_read')
      .eq('company_id', parsed.data.companyId)
      .eq('user_id', access.user.id)
      .in('notification_key', ids)
    if (error) return apiError(error)
    const states = new Map((data ?? []).map((row) => [row.notification_key, row.is_read]))
    return NextResponse.json({
      notifications: events.map((event) => ({ ...event, read: states.get(event.id) === true })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const access = await getWorkspaceAccess(parsed.data.companyId)
  if ('response' in access) return access.response

  try {
    const events = await loadEvents(access.admin, parsed.data.companyId)
    const targets = parsed.data.action === 'read_all'
      ? events
      : events.filter((event) => event.id === parsed.data.notificationId)
    if (targets.length === 0 && parsed.data.action !== 'read_all') {
      return NextResponse.json({ error: 'notification_not_found' }, { status: 404 })
    }
    if (targets.length === 0) return NextResponse.json({ ok: true })

    const isRead = parsed.data.action !== 'unread'
    const now = new Date().toISOString()
    const rows = targets.map((event) => ({
      company_id: parsed.data.companyId,
      user_id: access.user.id,
      notification_key: event.id,
      is_read: isRead,
      read_at: isRead ? now : null,
      updated_at: now,
    }))
    const { error } = await access.admin.from('notification_read_states')
      .upsert(rows, { onConflict: 'company_id,user_id,notification_key' })
    if (error) return apiError(error)
    return NextResponse.json({ ok: true, updated: rows.length })
  } catch (error) {
    return apiError(error)
  }
}
