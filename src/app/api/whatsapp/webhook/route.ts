import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'

interface WhatsAppMessage {
  from?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string }
  }
}

interface WhatsAppValue {
  metadata?: { phone_number_id?: string }
  contacts?: Array<{ profile?: { name?: string } }>
  messages?: WhatsAppMessage[]
}

interface WhatsAppEntry {
  changes?: Array<{ value?: WhatsAppValue }>
}

interface WhatsAppPayload {
  entry?: WhatsAppEntry[]
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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Invalid WhatsApp verification request' }, { status: 403 })
}

export async function POST(request: Request) {
  let payload: WhatsAppPayload

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ received: true })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const entries = payload.entry ?? []

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        const phoneNumberId = value?.metadata?.phone_number_id

        if (!phoneNumberId) continue

        const { data: connection, error: connectionError } = await supabase
          .from('whatsapp_connections')
          .select('company_id, active')
          .eq('phone_number_id', phoneNumberId)
          .eq('active', true)
          .maybeSingle()

        if (connectionError || !connection?.company_id) {
          continue
        }

        for (const message of value?.messages ?? []) {
          const phone = message.from?.trim()
          if (!phone) continue

          const interestedIn = getMessageText(message)
          const contactName = value?.contacts?.[0]?.profile?.name?.trim() || phone

          const { data: existingClient } = await supabase
            .from('clients')
            .select('id, interested_in, notes')
            .eq('company_id', connection.company_id)
            .eq('phone', phone)
            .maybeSingle()

          if (existingClient?.id) {
            await supabase
              .from('clients')
              .update({
                name: contactName,
                interested_in: interestedIn || existingClient.interested_in,
                notes: [
                  existingClient.notes,
                  interestedIn ? `WhatsApp: ${interestedIn}` : '',
                ].filter(Boolean).join('\n'),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingClient.id)
            continue
          }

          await supabase.from('clients').insert({
            company_id: connection.company_id,
            name: contactName,
            phone,
            interested_in: interestedIn || null,
            notes: interestedIn ? `WhatsApp: ${interestedIn}` : null,
            status: 'lead',
          })
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('WhatsApp webhook failed:', error)
    return NextResponse.json({ received: true })
  }
}
