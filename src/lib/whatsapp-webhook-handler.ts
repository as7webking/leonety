import 'server-only'
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { validateMetaSignature, WHATSAPP_PROVIDER, type WhatsAppClientCreationMode } from '@/lib/whatsapp-business'

interface WhatsAppMessage {
  id?: string
  from?: string
  timestamp?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  type?: string
}

interface WhatsAppStatus {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}

interface WhatsAppValue {
  metadata?: {
    phone_number_id?: string
    display_phone_number?: string
  }
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
  messages?: WhatsAppMessage[]
  statuses?: WhatsAppStatus[]
}

interface WhatsAppEntry {
  id?: string
  changes?: Array<{ field?: string; value?: WhatsAppValue }>
}

interface WhatsAppPayload {
  object?: string
  entry?: WhatsAppEntry[]
}

interface StoreIntegrationConnection {
  id: string
  company_id: string
  metadata: Record<string, unknown> | null
}

function getVerifyToken() {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || process.env.WHATSAPP_VERIFY_TOKEN?.trim() || ''
}

function getMessageText(message: WhatsAppMessage) {
  return (
    message.text?.body ||
    message.button?.text ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    ''
  ).trim()
}

function getClientCreationMode(metadata: Record<string, unknown> | null): WhatsAppClientCreationMode {
  const value = metadata?.clientCreationMode
  return value === 'auto_create_lead' || value === 'never' ? value : 'ask'
}

function getEventId(phoneNumberId: string, entry: WhatsAppEntry, message?: WhatsAppMessage, status?: WhatsAppStatus) {
  const providerId = message?.id || status?.id
  if (providerId) return providerId

  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ phoneNumberId, entryId: entry.id, message, status }))
    .digest('hex')
}

async function tryInsertWebhookEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string,
  connectionId: string,
  companyId: string,
  eventType: string
) {
  const { error } = await supabase
    .from('whatsapp_webhook_events')
    .insert({
      provider_event_id: eventId,
      store_integration_id: connectionId,
      company_id: companyId,
      event_type: eventType,
      processed_at: new Date().toISOString(),
    })

  if (!error) return 'inserted'
  if (error.code === '23505') return 'duplicate'
  if (error.code === '42P01' || error.code === 'PGRST205') return 'missing_table'
  throw error
}

async function updateLastWebhookAt(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  connectionId: string
) {
  await supabase
    .from('store_integrations')
    .update({
      last_webhook_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId)
}

async function upsertLeadFromMessage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  contactName: string,
  phone: string,
  interestedIn: string
) {
  const { data: existingClient } = await supabase
      .from('clients')
      .select('id, interested_in, notes')
      .eq('company_id', companyId)
      .eq('phone', phone)
      .maybeSingle()

  const noteLine = interestedIn ? `WhatsApp: ${interestedIn}` : 'WhatsApp inbound message'

  if (existingClient?.id) {
    await supabase
      .from('clients')
      .update({
        name: contactName,
        interested_in: interestedIn || existingClient.interested_in,
        notes: [existingClient.notes, noteLine].filter(Boolean).join('\n'),
        source: 'whatsapp',
        external_id: phone,
        first_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingClient.id)
    return
  }

  await supabase.from('clients').insert({
    company_id: companyId,
    name: contactName,
    phone,
    source: 'whatsapp',
    external_id: phone,
    first_contact_at: new Date().toISOString(),
    interested_in: interestedIn || null,
    notes: noteLine,
    status: 'lead',
  })
}

export async function verifyWhatsAppWebhook(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expectedToken = getVerifyToken()

  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Invalid WhatsApp verification request' }, { status: 403 })
}

export async function handleWhatsAppWebhook(request: Request) {
  let rawBody = ''

  try {
    rawBody = await request.text()

    if (!validateMetaSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
      return NextResponse.json({ received: false, error: 'Invalid WhatsApp signature.' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ received: false, error: 'WhatsApp webhook is not configured.' }, { status: 503 })
  }

  let payload: WhatsAppPayload

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ received: true })
  }

  const supabase = createSupabaseAdminClient()

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id

        if (!phoneNumberId) continue

        const { data: connection, error: connectionError } = await supabase
          .from('store_integrations')
          .select('id, company_id, metadata')
          .eq('provider', WHATSAPP_PROVIDER)
          .eq('merchant_id', phoneNumberId)
          .eq('status', 'connected')
          .maybeSingle()

        if (connectionError || !connection) continue

        const typedConnection = connection as StoreIntegrationConnection
        await updateLastWebhookAt(supabase, typedConnection.id)

        for (const status of value?.statuses ?? []) {
          const eventId = getEventId(phoneNumberId, entry, undefined, status)
          await tryInsertWebhookEvent(supabase, eventId, typedConnection.id, typedConnection.company_id, `status:${status.status ?? 'unknown'}`)
        }

        for (const message of value?.messages ?? []) {
          const eventId = getEventId(phoneNumberId, entry, message)
          const eventState = await tryInsertWebhookEvent(supabase, eventId, typedConnection.id, typedConnection.company_id, `message:${message.type ?? 'unknown'}`)
          if (eventState !== 'inserted') continue

          if (getClientCreationMode(typedConnection.metadata) !== 'auto_create_lead') continue

          const phone = message.from?.trim()
          if (!phone) continue

          const contactName = value?.contacts?.find((contact) => contact.wa_id === phone)?.profile?.name?.trim() ||
            value?.contacts?.[0]?.profile?.name?.trim() ||
            phone
          const interestedIn = getMessageText(message)
          await upsertLeadFromMessage(supabase, typedConnection.company_id, contactName, phone, interestedIn)
        }
      }
    }
  } catch {
    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}
