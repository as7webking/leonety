import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import {
  buildProductChannelComparison,
  classifyChannelProviderError,
  comparableProductFields,
  isSupportedComparisonProvider,
  type CanonicalChannelProduct,
  type ComparableProductField,
  type ProductChannelMapping,
  type ProductFieldOwner,
} from '@/lib/product-channel-comparison'
import { fetchExternalChannelProducts } from '@/lib/product-channel-server'

export const runtime = 'nodejs'

const itemSchema = z.object({
  productId: z.string().uuid().optional(),
  externalProductId: z.string().trim().min(1).max(200).optional(),
  fields: z.array(z.enum(comparableProductFields)).max(comparableProductFields.length).optional(),
})

const actionSchema = z.object({
  companyId: z.string().uuid(),
  provider: z.string().refine(isSupportedComparisonProvider),
  action: z.enum(['link', 'unlink', 'import', 'pull', 'set_ownership']),
  items: z.array(itemSchema).min(1).max(100),
  ownership: z.record(z.enum(comparableProductFields), z.enum(['leonety', 'provider', 'manual'])).optional(),
})

function normalizedIdentifier(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function isMissingRelation(error: { code?: string } | null) {
  return Boolean(error && ['42P01', 'PGRST205'].includes(error.code ?? ''))
}

function safeActionError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const allowed = [
    'product_pair_required', 'external_product_already_linked', 'local_product_required',
    'external_product_required', 'matching_product_requires_link', 'product_fields_required',
    'link_required_before_pull', 'sku_conflict', 'barcode_conflict', 'ownership_required',
  ]
  return allowed.includes(message) ? message : 'action_failed'
}

async function loadComparisonData(
  auth: Exclude<Awaited<ReturnType<typeof requireOwnedCompany>>, { error: NextResponse }>,
  companyId: string,
  provider: 'woocommerce' | 'shopify',
) {
  const [productResult, mappingResult, preferenceResult, externalProducts] = await Promise.all([
    auth.adminSupabase
      .from('products')
      .select('id, name, sku, barcode, selling_price, current_stock, category, image_url')
      .eq('company_id', companyId)
      .neq('status', 'archived')
      .order('name'),
    auth.adminSupabase
      .from('product_syncs')
      .select('product_id, external_product_id, sync_status, error_message')
      .eq('company_id', companyId)
      .eq('channel', provider),
    auth.adminSupabase
      .from('product_channel_preferences')
      .select('product_id, overrides')
      .eq('company_id', companyId)
      .eq('provider', provider),
    fetchExternalChannelProducts(auth.adminSupabase, companyId, provider),
  ])
  if (productResult.error) throw productResult.error
  if (mappingResult.error) throw mappingResult.error
  if (preferenceResult.error && !isMissingRelation(preferenceResult.error)) throw preferenceResult.error

  const localProducts = (productResult.data ?? []).map((product): CanonicalChannelProduct => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    price: product.selling_price === null ? null : Number(product.selling_price),
    stock: Number(product.current_stock ?? 0),
    category: product.category,
    image: product.image_url,
  }))
  const mappings = (mappingResult.data ?? []).map((mapping): ProductChannelMapping => ({
    productId: mapping.product_id,
    externalProductId: mapping.external_product_id,
    syncStatus: mapping.sync_status as ProductChannelMapping['syncStatus'],
    errorMessage: mapping.error_message,
  }))
  const ownershipByProduct: Record<string, Partial<Record<ComparableProductField, ProductFieldOwner>>> = {}
  for (const preference of preferenceResult.data ?? []) {
    const overrides = preference.overrides && typeof preference.overrides === 'object' && !Array.isArray(preference.overrides)
      ? preference.overrides as Record<string, unknown>
      : {}
    const ownership = overrides.fieldOwnership && typeof overrides.fieldOwnership === 'object' && !Array.isArray(overrides.fieldOwnership)
      ? overrides.fieldOwnership as Record<string, unknown>
      : {}
    ownershipByProduct[preference.product_id] = Object.fromEntries(
      comparableProductFields.flatMap((field) => ['leonety', 'provider', 'manual'].includes(String(ownership[field])) ? [[field, ownership[field] as ProductFieldOwner]] : []),
    )
  }
  return { localProducts, mappings, externalProducts, ownershipByProduct, preferencesAvailable: !preferenceResult.error }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const companyId = url.searchParams.get('companyId') ?? ''
    const providerValue = url.searchParams.get('provider')
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error
    if (!isSupportedComparisonProvider(providerValue)) return NextResponse.json({ error: 'unsupported_provider' }, { status: 400 })
    const data = await loadComparisonData(auth, companyId, providerValue)
    return NextResponse.json({
      provider: providerValue,
      rows: buildProductChannelComparison(data.localProducts, data.externalProducts, data.mappings, data.ownershipByProduct),
      externalProducts: data.externalProducts,
      preferencesAvailable: data.preferencesAvailable,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'comparison_failed'
    const status = classifyChannelProviderError(message)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const parsed = actionSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    const { companyId, provider, action, items } = parsed.data
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error
    const data = await loadComparisonData(auth, companyId, provider)
    const localById = new Map(data.localProducts.map((product) => [product.id, product]))
    const externalById = new Map(data.externalProducts.map((product) => [product.id, product]))
    const results: Array<{ productId?: string; externalProductId?: string; ok: boolean; error?: string }> = []

    for (const item of items) {
      try {
        const local = item.productId ? localById.get(item.productId) : null
        const external = item.externalProductId ? externalById.get(item.externalProductId) : null

        if (action === 'link') {
          if (!local || !external) throw new Error('product_pair_required')
          const { data: occupied, error: occupiedError } = await auth.adminSupabase
            .from('product_syncs')
            .select('product_id')
            .eq('company_id', companyId)
            .eq('channel', provider)
            .eq('external_product_id', external.id)
            .neq('product_id', local.id)
            .maybeSingle()
          if (occupiedError) throw occupiedError
          if (occupied) throw new Error('external_product_already_linked')
          const { error } = await auth.adminSupabase.from('product_syncs').upsert({
            company_id: companyId,
            product_id: local.id,
            channel: provider,
            external_product_id: external.id,
            sync_status: 'not_synced',
            error_message: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'company_id,product_id,channel' })
          if (error) throw error
        } else if (action === 'unlink') {
          if (!local) throw new Error('local_product_required')
          const { error } = await auth.adminSupabase.from('product_syncs')
            .delete()
            .eq('company_id', companyId)
            .eq('product_id', local.id)
            .eq('channel', provider)
          if (error) throw error
        } else if (action === 'import') {
          if (!external) throw new Error('external_product_required')
          const externalSku = normalizedIdentifier(external.sku)
          const externalBarcode = normalizedIdentifier(external.barcode)
          const identifierConflict = data.localProducts.find((product) =>
            (externalSku && normalizedIdentifier(product.sku) === externalSku) ||
            (externalBarcode && normalizedIdentifier(product.barcode) === externalBarcode))
          if (identifierConflict) throw new Error('matching_product_requires_link')
          if (data.mappings.some((mapping) => mapping.externalProductId === external.id)) throw new Error('external_product_already_linked')
          const { data: company, error: companyError } = await auth.adminSupabase.from('companies').select('currency').eq('id', companyId).single()
          if (companyError) throw companyError
          const { data: created, error: createError } = await auth.adminSupabase.from('products').insert({
            company_id: companyId,
            name: external.name,
            sku: external.sku,
            barcode: external.barcode,
            description: external.description,
            selling_price: external.price,
            currency: company.currency,
            current_stock: Math.max(0, Number(external.stock ?? 0)),
            low_stock_threshold: 0,
            category: external.category,
            image_url: external.image,
            status: external.status,
          }).select('id').single()
          if (createError) throw createError
          const { error: mappingError } = await auth.adminSupabase.from('product_syncs').insert({
            company_id: companyId,
            product_id: created.id,
            channel: provider,
            external_product_id: external.id,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            error_message: null,
          })
          if (mappingError) {
            await auth.adminSupabase.from('products').delete().eq('company_id', companyId).eq('id', created.id)
            throw mappingError
          }
          item.productId = created.id
        } else if (action === 'pull') {
          if (!local || !external || !item.fields?.length) throw new Error('product_fields_required')
          const mapping = data.mappings.find((entry) => entry.productId === local.id && entry.externalProductId === external.id)
          if (!mapping) throw new Error('link_required_before_pull')
          const fields = item.fields.filter((field) => external.supportedFields.includes(field))
          const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (fields.includes('name')) update.name = external.name
          if (fields.includes('sku')) update.sku = external.sku
          if (fields.includes('barcode')) update.barcode = external.barcode
          if (fields.includes('price')) update.selling_price = external.price
          if (fields.includes('stock')) update.current_stock = Math.max(0, Number(external.stock ?? 0))
          if (fields.includes('category')) update.category = external.category
          if (fields.includes('image')) update.image_url = external.image
          for (const field of ['sku', 'barcode'] as const) {
            const value = normalizedIdentifier(update[field] as string | null | undefined)
            if (!value) continue
            const conflict = data.localProducts.find((product) => product.id !== local.id && normalizedIdentifier(product[field]) === value)
            if (conflict) throw new Error(`${field}_conflict`)
          }
          const { error } = await auth.adminSupabase.from('products').update(update).eq('company_id', companyId).eq('id', local.id)
          if (error) throw error
          await auth.adminSupabase.from('product_syncs').update({ sync_status: 'synced', error_message: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('product_id', local.id).eq('channel', provider)
        } else if (action === 'set_ownership') {
          if (!local || !parsed.data.ownership) throw new Error('ownership_required')
          const { data: current, error: currentError } = await auth.adminSupabase.from('product_channel_preferences').select('publish_requested, overrides').eq('company_id', companyId).eq('product_id', local.id).eq('provider', provider).maybeSingle()
          if (currentError) throw currentError
          const overrides = current?.overrides && typeof current.overrides === 'object' && !Array.isArray(current.overrides) ? current.overrides as Record<string, unknown> : {}
          const { error } = await auth.adminSupabase.from('product_channel_preferences').upsert({
            company_id: companyId,
            product_id: local.id,
            provider,
            publish_requested: current?.publish_requested ?? false,
            overrides: { ...overrides, fieldOwnership: parsed.data.ownership },
            updated_at: new Date().toISOString(),
          }, { onConflict: 'company_id,product_id,provider' })
          if (error) throw error
        }
        results.push({ productId: item.productId, externalProductId: item.externalProductId, ok: true })
      } catch (error) {
        results.push({ productId: item.productId, externalProductId: item.externalProductId, ok: false, error: safeActionError(error) })
      }
    }
    const completed = results.filter((result) => result.ok).length
    return NextResponse.json({ completed, failed: results.length - completed, results }, { status: completed > 0 ? 200 : 409 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'action_failed' }, { status: 500 })
  }
}
