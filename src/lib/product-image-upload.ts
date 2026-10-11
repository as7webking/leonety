import type { SupabaseClient } from '@supabase/supabase-js'
import { BUSINESS_IMAGE_MAX_INPUT_BYTES, BUSINESS_IMAGE_MAX_OUTPUT_BYTES } from '@/lib/business-image-limits'

export type ImageUploadProgress = 'uploading' | 'converting'

export class ProductImageUploadError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ProductImageUploadError'
  }
}

export async function uploadProductImage({
  file,
  companyId,
  supabase,
  onProgress,
}: {
  file: File | Blob
  companyId: string
  supabase: SupabaseClient
  onProgress?: (progress: ImageUploadProgress) => void
}) {
  if (file.size > BUSINESS_IMAGE_MAX_INPUT_BYTES) throw new ProductImageUploadError('image_too_large')
  if (!file.size) throw new ProductImageUploadError('corrupt_image')

  onProgress?.('uploading')
  const sessionResponse = await fetch('/api/product-images/staging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId }),
  })
  const session = await sessionResponse.json().catch(() => ({})) as { path?: string; token?: string; error?: string }
  if (!sessionResponse.ok || !session.path || !session.token) {
    throw new ProductImageUploadError(session.error || 'conversion_failed')
  }

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .uploadToSignedUrl(session.path, session.token, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadError) throw new ProductImageUploadError('conversion_failed')

  onProgress?.('converting')
  const response = await fetch('/api/product-images/normalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, stagingPath: session.path }),
  })
  const result = await response.json().catch(() => ({})) as {
    imageUrl?: string
    storagePath?: string
    mimeType?: string
    size?: number
    width?: number
    height?: number
    error?: string
  }

  if (!response.ok || !result.imageUrl || result.mimeType !== 'image/jpeg' || !result.size || result.size >= BUSINESS_IMAGE_MAX_OUTPUT_BYTES) {
    throw new ProductImageUploadError(result.error || 'conversion_failed')
  }

  return result as Required<Pick<typeof result, 'imageUrl' | 'storagePath' | 'mimeType' | 'size' | 'width' | 'height'>>
}
