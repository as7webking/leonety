export const productCsvFields = [
  'name', 'description', 'sku', 'barcode', 'category', 'price', 'currency',
  'stock', 'image_url', 'status', 'external_id',
] as const

export type ProductCsvField = typeof productCsvFields[number]
export type ProductCsvFormat = 'leonety' | 'woocommerce'
export type ProductCsvExportFormat = ProductCsvFormat | 'shopify' | 'google_basic'
export type ProductCsvMapping = Partial<Record<ProductCsvField, string>>

export interface ParsedProductCsv {
  headers: string[]
  rows: Record<string, string>[]
  format: ProductCsvFormat
  mapping: ProductCsvMapping
}

export interface NormalizedProductCsvRow {
  sourceRow: number
  name: string
  description: string
  sku: string
  barcode: string
  category: string
  price: number | null
  currency: string
  stock: number
  imageUrl: string
  status: 'active' | 'inactive' | 'archived'
  externalId: string
  errors: string[]
}

export interface ProductCsvExistingIdentity {
  id: string
  name: string
  sku: string | null
  barcode: string | null
}

export interface ProductCsvExternalMapping {
  product_id: string
  external_product_id: string | null
}

export interface ClassifiedProductCsvRow extends NormalizedProductCsvRow {
  classification: 'new' | 'existing' | 'conflict' | 'invalid'
  reasons: string[]
  matchedProductId?: string
  matchedProductName?: string
}

const aliases: Record<ProductCsvField, string[]> = {
  name: ['name', 'product name', 'title'],
  description: ['description', 'body (html)', 'short description'],
  sku: ['sku', 'variant sku', 'article', 'article number'],
  barcode: ['barcode', 'gtin', 'ean', 'meta: barcode'],
  category: ['category', 'categories', 'product category', 'type'],
  price: ['price', 'regular price', 'variant price', 'selling price'],
  currency: ['currency'],
  stock: ['stock', 'stock quantity', 'variant inventory qty', 'quantity'],
  image_url: ['image_url', 'image url', 'images', 'image src'],
  status: ['status', 'published'],
  external_id: ['external_id', 'external id', 'id'],
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\ufeff/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('malformed_csv')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function delimiterScore(text: string, delimiter: string) {
  try {
    const rows = parseDelimitedRows(text.slice(0, 20000), delimiter).slice(0, 10)
    if (rows.length === 0) return 0
    const width = rows[0].length
    return width > 1 ? rows.filter((row) => row.length === width).length * width : 0
  } catch {
    return 0
  }
}

export function detectProductCsvFormat(headers: string[]): ProductCsvFormat {
  const normalized = headers.map(normalizeHeader)
  return normalized.includes('regular price') || normalized.includes('short description') || normalized.includes('meta: barcode')
    ? 'woocommerce'
    : 'leonety'
}

export function suggestProductCsvMapping(headers: string[]): ProductCsvMapping {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]))
  return Object.fromEntries(productCsvFields.flatMap((field) => {
    const header = aliases[field].map((alias) => normalized.get(alias)).find(Boolean)
    return header ? [[field, header]] : []
  }))
}

export function parseProductCsv(text: string, maxRows = 5000): ParsedProductCsv {
  if (!text.trim()) throw new Error('empty_csv')
  const delimiters = [',', ';', '\t']
  const delimiter = delimiters.sort((left, right) => delimiterScore(text, right) - delimiterScore(text, left))[0]
  const matrix = parseDelimitedRows(text, delimiter)
  if (matrix.length < 2) throw new Error('empty_csv')
  if (matrix.length - 1 > maxRows) throw new Error('too_many_rows')

  const headers = matrix[0].map((header, index) => header.trim().replace(/^\ufeff/, '') || `column_${index + 1}`)
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error('duplicate_headers')

  const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ''])))
  const format = detectProductCsvFormat(headers)
  return { headers, rows, format, mapping: suggestProductCsvMapping(headers) }
}

function parseNumber(value: string, integer = false) {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return integer ? 0 : null
  const normalized = trimmed.includes(',') && !trimmed.includes('.')
    ? trimmed.replace(',', '.')
    : trimmed.replace(/,/g, '')
  const number = Number(normalized.replace(/[^0-9+.-]/g, ''))
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) return undefined
  return number
}

function mappedValue(row: Record<string, string>, mapping: ProductCsvMapping, field: ProductCsvField) {
  const header = mapping[field]
  return header ? row[header]?.trim() ?? '' : ''
}

export function normalizeProductCsvRows(rows: Record<string, string>[], mapping: ProductCsvMapping, fallbackCurrency = 'EUR') {
  return rows.map<NormalizedProductCsvRow>((row, index) => {
    const errors: string[] = []
    const name = mappedValue(row, mapping, 'name')
    const parsedPrice = parseNumber(mappedValue(row, mapping, 'price'))
    const parsedStock = parseNumber(mappedValue(row, mapping, 'stock'), true)
    if (!name) errors.push('name_required')
    if (parsedPrice === undefined) errors.push('price_invalid')
    if (parsedStock === undefined) errors.push('stock_invalid')

    const rawStatus = mappedValue(row, mapping, 'status').toLowerCase()
    const status = rawStatus === 'inactive' || rawStatus === 'archived'
      ? rawStatus
      : rawStatus === '0' || rawStatus === 'false' || rawStatus === 'draft'
        ? 'inactive'
        : 'active'

    return {
      sourceRow: index + 2,
      name,
      description: mappedValue(row, mapping, 'description'),
      sku: mappedValue(row, mapping, 'sku'),
      barcode: mappedValue(row, mapping, 'barcode'),
      category: mappedValue(row, mapping, 'category').split('>')[0].trim(),
      price: parsedPrice === undefined ? null : parsedPrice,
      currency: mappedValue(row, mapping, 'currency').toUpperCase() || fallbackCurrency,
      stock: typeof parsedStock === 'number' ? parsedStock : 0,
      imageUrl: mappedValue(row, mapping, 'image_url').split(',')[0].trim(),
      status,
      externalId: mappedValue(row, mapping, 'external_id'),
      errors,
    }
  })
}

export function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(rows: unknown[][]) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

function normalizedIdentifier(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase('en-US') ?? ''
}

function duplicatedValues(rows: NormalizedProductCsvRow[], field: 'sku' | 'barcode' | 'externalId') {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = normalizedIdentifier(row[field])
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value))
}

export function classifyProductCsvRows(
  rows: NormalizedProductCsvRow[],
  products: ProductCsvExistingIdentity[],
  mappings: ProductCsvExternalMapping[]
): ClassifiedProductCsvRow[] {
  const bySku = new Map(products.flatMap((product) => product.sku ? [[normalizedIdentifier(product.sku), product]] : []))
  const byBarcode = new Map(products.flatMap((product) => product.barcode ? [[normalizedIdentifier(product.barcode), product]] : []))
  const byExternalId = new Map<string, Set<string>>()
  for (const mapping of mappings) {
    const externalId = normalizedIdentifier(mapping.external_product_id)
    if (!externalId) continue
    const productIds = byExternalId.get(externalId) ?? new Set<string>()
    productIds.add(mapping.product_id)
    byExternalId.set(externalId, productIds)
  }
  const productById = new Map(products.map((product) => [product.id, product]))
  const duplicateSkus = duplicatedValues(rows, 'sku')
  const duplicateBarcodes = duplicatedValues(rows, 'barcode')
  const duplicateExternalIds = duplicatedValues(rows, 'externalId')

  return rows.map((row) => {
    const reasons = [...row.errors]
    if (row.sku && duplicateSkus.has(normalizedIdentifier(row.sku))) reasons.push('duplicate_sku_in_file')
    if (row.barcode && duplicateBarcodes.has(normalizedIdentifier(row.barcode))) reasons.push('duplicate_barcode_in_file')
    if (row.externalId && duplicateExternalIds.has(normalizedIdentifier(row.externalId))) reasons.push('duplicate_external_id_in_file')
    if (reasons.length > 0) return { ...row, classification: 'invalid', reasons }

    const candidateIds = new Set<string>()
    const externalProductIds = row.externalId ? byExternalId.get(normalizedIdentifier(row.externalId)) : undefined
    const skuProduct = row.sku ? bySku.get(normalizedIdentifier(row.sku)) : undefined
    const barcodeProduct = row.barcode ? byBarcode.get(normalizedIdentifier(row.barcode)) : undefined
    for (const productId of externalProductIds ?? []) candidateIds.add(productId)
    if (skuProduct) candidateIds.add(skuProduct.id)
    if (barcodeProduct) candidateIds.add(barcodeProduct.id)

    if (candidateIds.size > 1) return { ...row, classification: 'conflict', reasons: ['identifiers_match_different_products'] }
    const matchedProductId = [...candidateIds][0]
    const matchedProduct = matchedProductId ? productById.get(matchedProductId) : undefined
    return { ...row, classification: matchedProduct ? 'existing' : 'new', reasons: [], matchedProductId: matchedProduct?.id, matchedProductName: matchedProduct?.name }
  })
}
