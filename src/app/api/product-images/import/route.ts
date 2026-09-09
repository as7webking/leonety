import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const requestSchema = z.object({
  companyId: z.string().uuid(),
  imageUrl: z.string().trim().min(1).max(4096),
  productName: z.string().trim().max(120).optional(),
})

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function sanitizeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product-image'
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function parseSafeImageUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('unsupported_url')
  }
  return url
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    const { companyId, imageUrl, productName } = parsed.data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('owner_id', authData.user.id)
      .maybeSingle()

    if (companyError) {
      return NextResponse.json({ error: 'workspace_check_failed' }, { status: 500 })
    }

    if (!company) {
      return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
    }

    const url = parseSafeImageUrl(imageUrl)
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'image_import_failed' }, { status: 400 })
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || ''
    if (!allowedMimeTypes.has(contentType)) {
      return NextResponse.json({ error: 'unsupported_image_type' }, { status: 400 })
    }

    const blob = await response.blob()
    if (blob.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
    }

    const filename = `${sanitizeFilename(productName || url.pathname.split('/').pop() || 'product-image')}-original.${extensionForMimeType(contentType)}`
    const storagePath = `${companyId}/products/originals/${Date.now()}-${filename}`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, blob, {
        contentType,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: 'image_storage_failed' }, { status: 500 })
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath)

    return NextResponse.json({
      imageUrl: data.publicUrl,
      storagePath,
      mimeType: contentType,
      size: blob.size,
    })
  } catch {
    return NextResponse.json({ error: 'image_import_failed' }, { status: 400 })
  }
}
