import { z } from 'zod'

const nullableText = z.union([z.string(), z.null(), z.undefined()])

const extractedProductSchema = z.object({
  position: nullableText,
  name: nullableText,
  description: nullableText,
  price: z.union([z.number(), z.string(), z.null(), z.undefined()]),
  category: nullableText,
})

const extractionSchema = z.object({
  products: z.array(extractedProductSchema).max(100),
})

export interface ProductImportDraft {
  id: string
  include: boolean
  position: string
  name: string
  description: string
  price: string
  category: string
}

export interface ExistingProductIdentity {
  id: string
  sku: string | null
  name: string
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : ''
  if (typeof value !== 'string') return ''
  const normalized = value.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '')
  if (!normalized) return ''
  const decimal = normalized.includes(',') && !normalized.includes('.')
    ? normalized.replace(',', '.')
    : normalized.replace(/,/g, '')
  const parsed = Number(decimal)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toFixed(2) : ''
}

export function parseProductExtraction(value: unknown): ProductImportDraft[] {
  const parsed = extractionSchema.parse(value)
  return parsed.products
    .map((product, index) => ({
      id: `draft-${index + 1}`,
      include: true,
      position: cleanText(product.position, 120),
      name: cleanText(product.name, 240),
      description: cleanText(product.description, 2000),
      price: normalizePrice(product.price),
      category: cleanText(product.category, 240),
    }))
    .filter((product) => product.name || product.position || product.price)
}

export function findSkuDuplicate(
  sku: string,
  existingProducts: ExistingProductIdentity[],
  drafts: ProductImportDraft[],
  draftId: string,
) {
  const normalized = sku.trim().toLocaleLowerCase()
  if (!normalized) return null

  const existing = existingProducts.find((product) => product.sku?.trim().toLocaleLowerCase() === normalized)
  if (existing) return { kind: 'existing' as const, label: existing.name }

  const duplicateDraft = drafts.find((draft) => draft.id !== draftId && draft.include && draft.position.trim().toLocaleLowerCase() === normalized)
  if (duplicateDraft) return { kind: 'draft' as const, label: duplicateDraft.name || duplicateDraft.position }
  return null
}

export function validateProductImportDraft(draft: ProductImportDraft) {
  if (!draft.name.trim()) return 'name_required' as const
  if (draft.price && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) return 'price_invalid' as const
  return null
}
