export const supportedComparisonProviders = ['woocommerce', 'shopify'] as const
export type SupportedComparisonProvider = typeof supportedComparisonProviders[number]

export const comparableProductFields = ['name', 'sku', 'barcode', 'price', 'stock', 'category', 'image'] as const
export type ComparableProductField = typeof comparableProductFields[number]
export type ProductChannelStatus = 'linked' | 'not_linked' | 'different' | 'only_leonety' | 'only_provider' | 'conflict' | 'sync_error'
export type ProductFieldOwner = 'leonety' | 'provider' | 'manual'

export interface CanonicalChannelProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
  stock: number
  category: string | null
  image: string | null
}

export interface ExternalChannelProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number | null
  stock: number | null
  category: string | null
  image: string | null
  description: string | null
  status: 'active' | 'inactive'
  supportedFields: ComparableProductField[]
}

export interface ProductChannelMapping {
  productId: string
  externalProductId: string | null
  syncStatus: 'not_synced' | 'pending' | 'synced' | 'failed'
  errorMessage: string | null
}

export interface ProductChannelComparisonRow {
  id: string
  status: ProductChannelStatus
  local: CanonicalChannelProduct | null
  external: ExternalChannelProduct | null
  differences: ComparableProductField[]
  matchReason: 'mapping' | 'sku' | 'barcode' | 'name_suggestion' | null
  candidateExternalIds: string[]
  syncError: string | null
  ownership: Partial<Record<ComparableProductField, ProductFieldOwner>>
}

function normalizedIdentifier(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function normalizedText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''
}

function namesAreSimilar(left: string, right: string) {
  const normalizedLeft = normalizedText(left)
  const normalizedRight = normalizedText(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const leftTokens = new Set(normalizedLeft.split(/[^\p{L}\p{N}]+/gu).filter((token) => token.length > 1))
  const rightTokens = new Set(normalizedRight.split(/[^\p{L}\p{N}]+/gu).filter((token) => token.length > 1))
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union >= 2 && intersection / union >= 0.8
}

function valuesDiffer(field: ComparableProductField, local: CanonicalChannelProduct, external: ExternalChannelProduct) {
  if (!external.supportedFields.includes(field)) return false
  if (field === 'price') {
    if (local.price === null && external.price === null) return false
    if (local.price === null || external.price === null) return true
    return Math.round(local.price * 100) !== Math.round(external.price * 100)
  }
  if (field === 'stock') return Math.trunc(local.stock) !== Math.trunc(external.stock ?? 0)
  if (field === 'image') return (local.image?.trim() ?? '') !== (external.image?.trim() ?? '')
  return normalizedText(local[field]) !== normalizedText(external[field])
}

export function getProductChannelDifferences(local: CanonicalChannelProduct, external: ExternalChannelProduct) {
  return comparableProductFields.filter((field) => valuesDiffer(field, local, external))
}

function rowId(localId: string | null, externalId: string | null) {
  return `${localId ?? 'provider'}:${externalId ?? 'leonety'}`
}

export function buildProductChannelComparison(
  localProducts: CanonicalChannelProduct[],
  externalProducts: ExternalChannelProduct[],
  mappings: ProductChannelMapping[],
  ownershipByProduct: Record<string, Partial<Record<ComparableProductField, ProductFieldOwner>>> = {},
) {
  const rows: ProductChannelComparisonRow[] = []
  const externalById = new Map(externalProducts.map((product) => [product.id, product]))
  const mappingsByProduct = new Map(mappings.map((mapping) => [mapping.productId, mapping]))
  const mappingCountByExternal = new Map<string, number>()
  const usedExternalIds = new Set<string>()

  for (const mapping of mappings) {
    if (!mapping.externalProductId) continue
    mappingCountByExternal.set(mapping.externalProductId, (mappingCountByExternal.get(mapping.externalProductId) ?? 0) + 1)
  }

  const localIdentifierCounts = (field: 'sku' | 'barcode') => {
    const counts = new Map<string, number>()
    for (const product of localProducts) {
      const value = normalizedIdentifier(product[field])
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return counts
  }
  const localSkuCounts = localIdentifierCounts('sku')
  const localBarcodeCounts = localIdentifierCounts('barcode')

  for (const local of localProducts) {
    const mapping = mappingsByProduct.get(local.id)
    const ownership = ownershipByProduct[local.id] ?? {}
    if (mapping?.externalProductId) {
      const external = externalById.get(mapping.externalProductId) ?? null
      if (!external) {
        rows.push({ id: rowId(local.id, mapping.externalProductId), status: 'sync_error', local, external: null, differences: [], matchReason: 'mapping', candidateExternalIds: [], syncError: mapping.errorMessage || 'mapped_product_missing', ownership })
        continue
      }
      usedExternalIds.add(external.id)
      const differences = getProductChannelDifferences(local, external)
      const duplicateMapping = (mappingCountByExternal.get(external.id) ?? 0) > 1
      rows.push({
        id: rowId(local.id, external.id),
        status: duplicateMapping ? 'conflict' : mapping.syncStatus === 'failed' ? 'sync_error' : differences.length > 0 ? 'different' : 'linked',
        local,
        external,
        differences,
        matchReason: 'mapping',
        candidateExternalIds: [],
        syncError: mapping.syncStatus === 'failed' ? mapping.errorMessage : null,
        ownership,
      })
      continue
    }

    const availableExternal = externalProducts.filter((product) => !usedExternalIds.has(product.id))
    const sku = normalizedIdentifier(local.sku)
    const barcode = normalizedIdentifier(local.barcode)
    const skuMatches = sku ? availableExternal.filter((product) => normalizedIdentifier(product.sku) === sku) : []
    const barcodeMatches = barcode ? availableExternal.filter((product) => normalizedIdentifier(product.barcode) === barcode) : []
    const strongMatches = skuMatches.length > 0 ? skuMatches : barcodeMatches
    const reason = skuMatches.length > 0 ? 'sku' as const : barcodeMatches.length > 0 ? 'barcode' as const : null
    const localIdentifierConflict = (sku && (localSkuCounts.get(sku) ?? 0) > 1) || (barcode && (localBarcodeCounts.get(barcode) ?? 0) > 1)

    if (strongMatches.length === 1 && !localIdentifierConflict) {
      const external = strongMatches[0]
      usedExternalIds.add(external.id)
      rows.push({ id: rowId(local.id, external.id), status: 'not_linked', local, external, differences: getProductChannelDifferences(local, external), matchReason: reason, candidateExternalIds: [external.id], syncError: null, ownership })
      continue
    }
    if (strongMatches.length > 1 || (strongMatches.length > 0 && localIdentifierConflict)) {
      rows.push({ id: rowId(local.id, null), status: 'conflict', local, external: null, differences: [], matchReason: reason, candidateExternalIds: strongMatches.map((product) => product.id), syncError: null, ownership })
      continue
    }

    const nameSuggestions = availableExternal.filter((product) => namesAreSimilar(local.name, product.name))
    if (nameSuggestions.length === 1) {
      const external = nameSuggestions[0]
      usedExternalIds.add(external.id)
      rows.push({ id: rowId(local.id, external.id), status: 'not_linked', local, external, differences: getProductChannelDifferences(local, external), matchReason: 'name_suggestion', candidateExternalIds: [external.id], syncError: null, ownership })
      continue
    }
    rows.push({ id: rowId(local.id, null), status: nameSuggestions.length > 1 ? 'conflict' : 'only_leonety', local, external: null, differences: [], matchReason: nameSuggestions.length > 1 ? 'name_suggestion' : null, candidateExternalIds: nameSuggestions.map((product) => product.id), syncError: null, ownership })
  }

  for (const external of externalProducts) {
    if (usedExternalIds.has(external.id)) continue
    rows.push({ id: rowId(null, external.id), status: 'only_provider', local: null, external, differences: [], matchReason: null, candidateExternalIds: [], syncError: null, ownership: {} })
  }

  const rank: Record<ProductChannelStatus, number> = { conflict: 0, sync_error: 1, different: 2, not_linked: 3, only_leonety: 4, only_provider: 5, linked: 6 }
  return rows.sort((left, right) => rank[left.status] - rank[right.status] || (left.local?.name ?? left.external?.name ?? '').localeCompare(right.local?.name ?? right.external?.name ?? ''))
}

export function isSupportedComparisonProvider(value: unknown): value is SupportedComparisonProvider {
  return typeof value === 'string' && supportedComparisonProviders.includes(value as SupportedComparisonProvider)
}

export function classifyChannelProviderError(message: string) {
  if (/timed out|timeout|aborted/i.test(message)) return 504
  if (/rate limit|too many requests|\b429\b/i.test(message)) return 429
  if (/not connected/i.test(message) || message === 'provider_not_connected') return 400
  return 502
}
