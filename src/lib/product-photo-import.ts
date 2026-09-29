import { z } from 'zod'

const nullableText = z.union([z.string(), z.null(), z.undefined()])
const extractedProductSchema = z.object({
  position: nullableText,
  sku: nullableText,
  barcode: nullableText,
  name: nullableText,
  description: nullableText,
  price: z.union([z.number(), z.string(), z.null(), z.undefined()]),
  category: nullableText,
})
const extractionSchema = z.object({ products: z.array(extractedProductSchema).max(100) })

export interface ProductImportDraft {
  id: string
  include: boolean
  sku: string
  barcode: string
  name: string
  description: string
  price: string
  category: string
  sourceNames: string[]
  mergeConflicts: string[]
  reviewedAsNew: boolean
}

export interface ExistingProductIdentity {
  id: string
  sku: string | null
  barcode?: string | null
  name: string
}

export type ProductPhotoDraftStatus = 'new' | 'possible_match' | 'existing' | 'conflict' | 'invalid'

export interface ProductPhotoDraftAssessment {
  status: ProductPhotoDraftStatus
  reason?: string
  matchedProductId?: string
  matchedProductName?: string
  needsReview: boolean
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeIdentifier(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function normalizeName(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function nameTokens(value: string) {
  return new Set(normalizeName(value).split(' ').filter((token) => token.length > 1))
}

function namesAreSimilar(left: string, right: string) {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  const leftTokens = nameTokens(left)
  const rightTokens = nameTokens(right)
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union >= 2 && intersection / union >= 0.8
}

function normalizePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : ''
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '')
  if (!normalized) return ''
  const decimal = normalized.includes(',') && !normalized.includes('.') ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
  const parsed = Number(decimal)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : ''
}

export function parseProductExtraction(value: unknown, sourceName = 'photo'): ProductImportDraft[] {
  const parsed = extractionSchema.parse(value)
  return parsed.products.map((product, index) => ({
    id: `${sourceName}-${index + 1}`,
    include: true,
    sku: cleanText(product.sku || product.position, 120),
    barcode: cleanText(product.barcode, 120),
    name: cleanText(product.name, 240),
    description: cleanText(product.description, 2000),
    price: normalizePrice(product.price),
    category: cleanText(product.category, 240),
    sourceNames: [sourceName],
    mergeConflicts: [],
    reviewedAsNew: false,
  })).filter((product) => product.name || product.sku || product.barcode || product.price)
}

function strongMatch(left: ProductImportDraft, right: ProductImportDraft) {
  const leftBarcode = normalizeIdentifier(left.barcode)
  const rightBarcode = normalizeIdentifier(right.barcode)
  const leftSku = normalizeIdentifier(left.sku)
  const rightSku = normalizeIdentifier(right.sku)
  return Boolean((leftBarcode && leftBarcode === rightBarcode) || (leftSku && leftSku === rightSku))
}

function mergeTwoDrafts(existing: ProductImportDraft, incoming: ProductImportDraft): ProductImportDraft {
  const conflicts = new Set([...existing.mergeConflicts, ...incoming.mergeConflicts])
  if (existing.sku && incoming.sku && normalizeIdentifier(existing.sku) !== normalizeIdentifier(incoming.sku)) conflicts.add('sku_conflict')
  if (existing.barcode && incoming.barcode && normalizeIdentifier(existing.barcode) !== normalizeIdentifier(incoming.barcode)) conflicts.add('barcode_conflict')
  return {
    ...existing,
    sku: existing.sku || incoming.sku,
    barcode: existing.barcode || incoming.barcode,
    name: existing.name || incoming.name,
    description: existing.description || incoming.description,
    price: existing.price || incoming.price,
    category: existing.category || incoming.category,
    sourceNames: [...new Set([...existing.sourceNames, ...incoming.sourceNames])],
    mergeConflicts: [...conflicts],
    reviewedAsNew: false,
  }
}

export function mergeProductImportDrafts(current: ProductImportDraft[], incoming: ProductImportDraft[]) {
  const merged = current.map((draft) => ({ ...draft, sourceNames: [...draft.sourceNames], mergeConflicts: [...draft.mergeConflicts] }))
  for (const draft of incoming) {
    const indexes = merged.flatMap((candidate, index) => strongMatch(candidate, draft) ? [index] : [])
    if (indexes.length === 1) merged[indexes[0]] = mergeTwoDrafts(merged[indexes[0]], draft)
    else if (indexes.length > 1) merged.push({ ...draft, mergeConflicts: [...draft.mergeConflicts, 'identifiers_match_different_drafts'] })
    else merged.push(draft)
  }
  return merged
}

export function assessProductImportDraft(
  draft: ProductImportDraft,
  existingProducts: ExistingProductIdentity[],
  drafts: ProductImportDraft[],
): ProductPhotoDraftAssessment {
  const validation = validateProductImportDraft(draft)
  if (validation) return { status: 'invalid', reason: validation, needsReview: true }
  if (draft.mergeConflicts.length > 0) return { status: 'conflict', reason: draft.mergeConflicts[0], needsReview: true }

  const candidateIds = new Set<string>()
  for (const product of existingProducts) {
    if (draft.sku && normalizeIdentifier(draft.sku) === normalizeIdentifier(product.sku)) candidateIds.add(product.id)
    if (draft.barcode && normalizeIdentifier(draft.barcode) === normalizeIdentifier(product.barcode)) candidateIds.add(product.id)
  }
  if (candidateIds.size > 1) return { status: 'conflict', reason: 'identifiers_match_different_products', needsReview: true }
  if (candidateIds.size === 1) {
    const product = existingProducts.find((item) => item.id === [...candidateIds][0])
    return { status: 'existing', reason: 'strong_identifier_match', matchedProductId: product?.id, matchedProductName: product?.name, needsReview: true }
  }

  const duplicateDraft = drafts.find((candidate) => candidate.id !== draft.id && strongMatch(candidate, draft))
  if (duplicateDraft) return { status: 'conflict', reason: 'duplicate_draft_identifier', needsReview: true }

  const possibleExisting = existingProducts.find((product) => namesAreSimilar(draft.name, product.name))
  if (possibleExisting) return { status: 'possible_match', reason: 'similar_name', matchedProductId: possibleExisting.id, matchedProductName: possibleExisting.name, needsReview: !draft.reviewedAsNew }
  const possibleDraft = drafts.find((candidate) => candidate.id !== draft.id && namesAreSimilar(draft.name, candidate.name))
  if (possibleDraft) return { status: 'possible_match', reason: 'similar_name_in_session', matchedProductName: possibleDraft.name, needsReview: !draft.reviewedAsNew }
  return { status: 'new', needsReview: !draft.price || (!draft.sku && !draft.barcode) }
}

export function validateProductImportDraft(draft: ProductImportDraft) {
  if (!draft.name.trim()) return 'name_required' as const
  if (draft.price && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) return 'price_invalid' as const
  return null
}
