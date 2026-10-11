import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { BusinessImageError, BUSINESS_IMAGE_MAX_INPUT_BYTES, normalizeBusinessImage } from '@/lib/business-image-normalizer'

export const runtime = 'nodejs'

const requestSchema = z.object({
  companyId: z.string().uuid(),
  stagingPath: z.string().min(1).max(512),
})
const bucket = 'product-images'

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { companyId, stagingPath } = parsed.data
  const access = await requireOwnedCompany(companyId)
  if (access.error) return NextResponse.json({ error: 'workspace_access_denied' }, { status: access.error.status })

  const prefix = `${companyId}/products/normalization-staging/${access.user.id}/`
  if (!stagingPath.startsWith(prefix) || stagingPath.includes('..') || stagingPath.includes('\\')) {
    return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
  }

  const fileName = stagingPath.slice(prefix.length)
  if (!/^[0-9a-f-]{36}\.upload$/i.test(fileName)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const storage = access.adminSupabase.storage.from(bucket)
  let normalized: Awaited<ReturnType<typeof normalizeBusinessImage>> | null = null
  let storageError = false

  try {
    const { data: files, error: listError } = await storage.list(`${companyId}/products/normalization-staging/${access.user.id}`, {
      limit: 100,
      search: fileName,
    })
    if (listError) return NextResponse.json({ error: 'conversion_failed' }, { status: 503 })
    const stagedFile = files?.find((file) => file.name === fileName)
    const size = Number(stagedFile?.metadata?.size)
    if (!stagedFile || !Number.isFinite(size) || size < 1) {
      return NextResponse.json({ error: 'corrupt_image' }, { status: 400 })
    }
    if (size > BUSINESS_IMAGE_MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
    }

    const { data: blob, error: downloadError } = await storage.download(stagingPath)
    if (downloadError) return NextResponse.json({ error: 'conversion_failed' }, { status: 503 })
    if (!blob) return NextResponse.json({ error: 'corrupt_image' }, { status: 400 })
    if (blob.size > BUSINESS_IMAGE_MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
    }

    normalized = await normalizeBusinessImage(Buffer.from(await blob.arrayBuffer()))
    const finalPath = `${companyId}/products/${crypto.randomUUID()}.jpg`
    const { error: uploadError } = await storage.upload(finalPath, normalized.buffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploadError) {
      storageError = true
      return NextResponse.json({ error: 'conversion_failed' }, { status: 500 })
    }

    const { data: publicData } = storage.getPublicUrl(finalPath)
    return NextResponse.json({
      imageUrl: publicData.publicUrl,
      storagePath: finalPath,
      mimeType: 'image/jpeg',
      size: normalized.size,
      width: normalized.width,
      height: normalized.height,
    })
  } catch (error) {
    if (error instanceof BusinessImageError) return NextResponse.json({ error: error.code }, { status: 400 })
    storageError = true
    return NextResponse.json({ error: 'conversion_failed' }, { status: 500 })
  } finally {
    await storage.remove([stagingPath]).catch(() => undefined)
    if (storageError) console.error('[product-image-normalization] storage failure')
  }
}
