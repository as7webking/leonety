import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { AiProviderError, generateAiVisionJson, getAiProviderCapabilities } from '@/lib/ai-provider'
import { parseProductExtraction } from '@/lib/product-photo-import'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const confirmSchema = z.object({
  companyId: z.string().uuid(),
  products: z.array(z.object({
    sku: z.string().trim().max(120),
    barcode: z.string().trim().max(120),
    name: z.string().trim().min(1).max(240),
    description: z.string().trim().max(2000),
    price: z.union([z.string(), z.number()]).transform((value) => value === '' ? null : Number(value)).refine((value) => value === null || (Number.isFinite(value) && value >= 0)),
    category: z.string().trim().max(240),
  })).min(1).max(600),
})

function isRateLimited(userId: string) {
  const now = Date.now()
  const current = rateLimits.get(userId)
  if (!current || current.resetAt <= now) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  if (current.count >= RATE_LIMIT_MAX) return true
  current.count += 1
  return false
}

function detectImageMime(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

function providerErrorStatus(error: AiProviderError) {
  if (error.code === 'configuration_missing') return 503
  if (error.code === 'provider_auth_failed' || error.code === 'invalid_model') return 503
  if (error.code === 'rate_limited' || error.code === 'quota_exhausted') return 429
  if (error.code === 'request_timeout') return 504
  return 502
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const companyId = String(formData.get('companyId') ?? '')
    const sourceName = String(formData.get('sourceName') ?? 'photo').slice(0, 160)
    const image = formData.get('image')
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error
    if (isRateLimited(auth.user.id)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    if (!(image instanceof File) || image.size === 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'invalid_image' }, { status: 400 })
    }
    if (!getAiProviderCapabilities().vision) {
      return NextResponse.json({ error: 'vision_unavailable' }, { status: 503 })
    }

    const bytes = new Uint8Array(await image.arrayBuffer())
    const mime = detectImageMime(bytes)
    if (!mime) return NextResponse.json({ error: 'unsupported_image' }, { status: 400 })
    const imageDataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    const response = await generateAiVisionJson({
      instructions: [
        'Extract product or menu rows only from information visibly present in the supplied image.',
        'Never infer hidden products, prices, descriptions, categories, taxes, currency conversions, or identifiers.',
        'Return JSON only as {"products":[{"sku":string|null,"barcode":string|null,"name":string|null,"description":string|null,"price":number|string|null,"category":string|null}]}.',
        'Keep visible wording in its original language. Use null when a field is not credible or not visible.',
        'SKU is only a visibly printed item, position, or article number. Barcode is only a visibly readable barcode number. Never invent either identifier.',
      ].join(' '),
      prompt: 'Read this menu or product photo and return only credible visible product rows for human review. Do not save anything.',
      imageDataUrl,
    })
    const drafts = parseProductExtraction(JSON.parse(response), sourceName)
    return NextResponse.json({ drafts })
  } catch (error) {
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.code }, { status: providerErrorStatus(error) })
    }
    return NextResponse.json({ error: 'extraction_failed' }, { status: 400 })
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = confirmSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_products' }, { status: 400 })
    const auth = await requireOwnedCompany(parsed.data.companyId)
    if ('error' in auth) return auth.error

    const normalizedSkus = parsed.data.products.map((product) => product.sku.trim().toLocaleLowerCase()).filter(Boolean)
    const normalizedBarcodes = parsed.data.products.map((product) => product.barcode.trim().toLocaleLowerCase()).filter(Boolean)
    if (new Set(normalizedSkus).size !== normalizedSkus.length) {
      return NextResponse.json({ error: 'duplicate_sku' }, { status: 409 })
    }
    if (new Set(normalizedBarcodes).size !== normalizedBarcodes.length) {
      return NextResponse.json({ error: 'duplicate_barcode' }, { status: 409 })
    }

    const [{ data: company, error: companyError }, { data: existingProducts, error: existingError }] = await Promise.all([
      auth.adminSupabase.from('companies').select('currency').eq('id', parsed.data.companyId).single(),
      auth.adminSupabase.from('products').select('id, sku, barcode').eq('company_id', parsed.data.companyId),
    ])
    if (companyError || existingError || !company) {
      return NextResponse.json({ error: 'workspace_check_failed' }, { status: 500 })
    }
    const existingSkus = new Set((existingProducts ?? []).map((product) => product.sku?.trim().toLocaleLowerCase()).filter(Boolean))
    const existingBarcodes = new Set((existingProducts ?? []).map((product) => product.barcode?.trim().toLocaleLowerCase()).filter(Boolean))
    if (normalizedSkus.some((sku) => existingSkus.has(sku)) || normalizedBarcodes.some((barcode) => existingBarcodes.has(barcode))) {
      return NextResponse.json({ error: 'existing_product' }, { status: 409 })
    }

    const rows = parsed.data.products.map((product) => ({
      company_id: parsed.data.companyId,
      name: product.name,
      sku: product.sku || null,
      barcode: product.barcode || null,
      description: product.description || null,
      selling_price: product.price,
      category: product.category || null,
      currency: company.currency,
      current_stock: 0,
      low_stock_threshold: 0,
      status: 'active',
    }))
    const { data, error } = await auth.adminSupabase.from('products').insert(rows).select('id')
    if (error) {
      return NextResponse.json({ error: error.code === '23505' ? 'duplicate_sku' : 'import_failed' }, { status: error.code === '23505' ? 409 : 500 })
    }
    return NextResponse.json({ created: data?.length ?? rows.length })
  } catch {
    return NextResponse.json({ error: 'import_failed' }, { status: 500 })
  }
}
