import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { BusinessImageError, normalizeBusinessImage } from '@/lib/business-image-normalizer'
import { BUSINESS_IMAGE_MAX_INPUT_BYTES } from '@/lib/business-image-limits'

export const runtime = 'nodejs'

const requestSchema = z.object({
  companyId: z.string().uuid(),
  imageUrl: z.string().trim().min(1).max(4096),
})

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

    const { companyId, imageUrl } = parsed.data
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
      signal: AbortSignal.timeout(10_000),
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.1',
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'image_import_failed' }, { status: 400 })
    }

    const statedLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(statedLength) && statedLength > BUSINESS_IMAGE_MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
    }

    const chunks: Uint8Array[] = []
    let total = 0
    if (!response.body) return NextResponse.json({ error: 'corrupt_image' }, { status: 400 })
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > BUSINESS_IMAGE_MAX_INPUT_BYTES) {
        await reader.cancel()
        return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
      }
      chunks.push(value)
    }

    const normalized = await normalizeBusinessImage(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
    const storagePath = `${companyId}/products/${crypto.randomUUID()}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, normalized.buffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: 'image_storage_failed' }, { status: 500 })
    }

    const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath)

    return NextResponse.json({
      imageUrl: data.publicUrl,
      storagePath,
      mimeType: 'image/jpeg',
      size: normalized.size,
      width: normalized.width,
      height: normalized.height,
    })
  } catch (error) {
    if (error instanceof BusinessImageError) return NextResponse.json({ error: error.code }, { status: 400 })
    return NextResponse.json({ error: 'image_import_failed' }, { status: 400 })
  }
}
