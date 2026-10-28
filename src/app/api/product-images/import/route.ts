import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { normalizeProductImage, ProductImageValidationError } from '@/lib/product-image-normalizer'
import { BUSINESS_IMAGE_MAX_INPUT_BYTES } from '@/lib/business-image-limits'
import { fetchSafeRemoteImage, RemoteImageFetchError } from '@/lib/safe-remote-image'

export const runtime = 'nodejs'

const requestSchema = z.object({
  companyId: z.string().uuid(),
  imageUrl: z.string().trim().min(1).max(4096),
})

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

    const remoteImage = await fetchSafeRemoteImage(imageUrl, BUSINESS_IMAGE_MAX_INPUT_BYTES)
    const normalized = await normalizeProductImage(remoteImage)
    const extension = normalized.mimeType === 'image/jpeg' ? 'jpg' : normalized.mimeType === 'image/png' ? 'png' : 'webp'
    const storagePath = `${companyId}/products/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(storagePath, normalized.buffer, {
        contentType: normalized.mimeType,
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
      mimeType: normalized.mimeType,
      size: normalized.size,
      width: normalized.width,
      height: normalized.height,
    })
  } catch (error) {
    if (error instanceof ProductImageValidationError) return NextResponse.json({ error: error.code }, { status: 400 })
    if (error instanceof RemoteImageFetchError) {
      const status = error.code === 'timeout' ? 504 : 400
      return NextResponse.json({ error: error.code === 'too_large' ? 'image_too_large' : 'image_import_failed' }, { status })
    }
    return NextResponse.json({ error: 'image_import_failed' }, { status: 400 })
  }
}
