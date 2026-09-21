import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { detectAudioType, ORDER_ALERT_SOUND_BUCKET, ORDER_ALERT_SOUND_MAX_BYTES, sanitizeSoundFilename } from '@/lib/order-notifications'

export const runtime = 'nodejs'

const querySchema = z.object({ companyId: z.string().uuid() })

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error

  const { data: settings, error } = await auth.adminSupabase.from('order_notification_settings').select('foreground_sound_enabled, foreground_sound_path, foreground_sound_name').eq('company_id', parsed.data.companyId).maybeSingle()
  if (error) return NextResponse.json({ error: 'sound_load_failed' }, { status: 500 })
  if (settings?.foreground_sound_enabled === false) return NextResponse.json({ enabled: false, url: null, name: settings.foreground_sound_name ?? '' })
  if (!settings?.foreground_sound_path) return NextResponse.json({ enabled: true, url: null, name: '' })

  const signed = await auth.adminSupabase.storage.from(ORDER_ALERT_SOUND_BUCKET).createSignedUrl(settings.foreground_sound_path, 60)
  if (signed.error) return NextResponse.json({ error: 'sound_load_failed' }, { status: 500 })
  return NextResponse.json({ enabled: true, url: signed.data.signedUrl, name: settings.foreground_sound_name ?? '' })
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const companyId = form?.get('companyId')
  const file = form?.get('file')
  const parsed = z.string().uuid().safeParse(companyId)
  if (!parsed.success || !(file instanceof File)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if (file.size <= 0 || file.size > ORDER_ALERT_SOUND_MAX_BYTES) return NextResponse.json({ error: 'invalid_sound' }, { status: 400 })

  const header = new Uint8Array((await file.slice(0, 16).arrayBuffer()))
  const detectedType = detectAudioType(header, file.type)
  if (!detectedType) return NextResponse.json({ error: 'invalid_sound' }, { status: 400 })
  const extension = file.name.toLowerCase().split('.').pop()
  if ((detectedType === 'audio/mpeg' && extension !== 'mp3') || (detectedType === 'audio/wav' && extension !== 'wav')) {
    return NextResponse.json({ error: 'invalid_sound' }, { status: 400 })
  }

  const auth = await requireOwnedCompany(parsed.data)
  if ('error' in auth) return auth.error
  const { data: current, error: currentError } = await auth.adminSupabase.from('order_notification_settings').select('foreground_sound_path').eq('company_id', parsed.data).maybeSingle()
  if (currentError) return NextResponse.json({ error: 'sound_save_failed' }, { status: 500 })

  const storageExtension = detectedType === 'audio/mpeg' ? 'mp3' : 'wav'
  const safeName = sanitizeSoundFilename(file.name)
  const path = `${parsed.data}/${randomUUID()}.${storageExtension}`
  const upload = await auth.adminSupabase.storage.from(ORDER_ALERT_SOUND_BUCKET).upload(path, file, { contentType: detectedType, upsert: false })
  if (upload.error) return NextResponse.json({ error: 'sound_save_failed' }, { status: 500 })

  const now = new Date().toISOString()
  const save = await auth.adminSupabase.from('order_notification_settings').upsert({
    company_id: parsed.data,
    foreground_sound_path: path,
    foreground_sound_name: safeName,
    foreground_sound_mime: detectedType,
    updated_by: auth.user.id,
    updated_at: now,
  }, { onConflict: 'company_id' })
  if (save.error) {
    await auth.adminSupabase.storage.from(ORDER_ALERT_SOUND_BUCKET).remove([path])
    return NextResponse.json({ error: 'sound_save_failed' }, { status: 500 })
  }
  if (current?.foreground_sound_path) await auth.adminSupabase.storage.from(ORDER_ALERT_SOUND_BUCKET).remove([current.foreground_sound_path])
  return NextResponse.json({ name: safeName, mime: detectedType })
}

export async function DELETE(request: Request) {
  const parsed = querySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const auth = await requireOwnedCompany(parsed.data.companyId)
  if ('error' in auth) return auth.error
  const { data: current, error: loadError } = await auth.adminSupabase.from('order_notification_settings').select('foreground_sound_path').eq('company_id', parsed.data.companyId).maybeSingle()
  if (loadError) return NextResponse.json({ error: 'sound_remove_failed' }, { status: 500 })
  const { error } = await auth.adminSupabase.from('order_notification_settings').update({ foreground_sound_path: null, foreground_sound_name: null, foreground_sound_mime: null, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq('company_id', parsed.data.companyId)
  if (error) return NextResponse.json({ error: 'sound_remove_failed' }, { status: 500 })
  if (current?.foreground_sound_path) await auth.adminSupabase.storage.from(ORDER_ALERT_SOUND_BUCKET).remove([current.foreground_sound_path])
  return NextResponse.json({ ok: true })
}
