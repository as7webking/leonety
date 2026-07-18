'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Barcode, BriefcaseBusiness, Building2, Copy, Download, Edit, PackagePlus, RefreshCw, Search, UploadCloud } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { currencyOptions, formatCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'

const productStatuses = ['active', 'inactive', 'archived'] as const
type ProductStatus = typeof productStatuses[number]

interface Product {
  id: string
  company_id: string
  name: string
  category_id?: string | null
  sku: string | null
  barcode: string | null
  category: string | null
  description: string | null
  purchase_price: number | null
  selling_price: number | null
  currency: string
  current_stock: number
  low_stock_threshold: number
  status: ProductStatus
  image_url?: string | null
  woo_product_type?: 'simple' | 'variable' | null
  woo_attributes?: unknown
  woo_variants?: unknown
}

interface ProductCategory {
  id: string
  company_id: string
  name: string
}

interface ProductForm {
  name: string
  sku: string
  barcode: string
  category: string
  description: string
  purchase_price: string
  selling_price: string
  currency: string
  low_stock_threshold: string
  status: ProductStatus
  image_url: string
  publish_to_woocommerce: boolean
  woo_product_type: 'simple' | 'variable'
  woo_attributes: string
  woo_variants: string
}

interface ProductSync {
  product_id: string
  channel: 'woocommerce' | 'shopify' | 'opencart' | 'google_merchant'
  external_product_id: string | null
  sync_status: 'not_synced' | 'pending' | 'synced' | 'failed'
  last_synced_at: string | null
  error_message: string | null
}

interface BulkEditForm {
  category: string
  selling_price: string
  current_stock: string
  status: '' | ProductStatus
}

const makeEmptyForm = (currency = 'EUR'): ProductForm => ({
  name: '',
  sku: '',
  barcode: '',
  category: '',
  description: '',
  purchase_price: '',
  selling_price: '',
  currency,
  low_stock_threshold: '0',
  status: 'active',
  image_url: '',
  publish_to_woocommerce: false,
  woo_product_type: 'simple',
  woo_attributes: '',
  woo_variants: '',
})

function stringifyJson(value: unknown) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return ''
  }

  return JSON.stringify(value, null, 2)
}

function parseJsonArray(value: string, label: string) {
  const trimmed = value.trim()
  if (!trimmed) return []

  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`)
  }

  return parsed
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function handleFromName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'
}

function getAttributes(value: unknown): Array<{ name: string; options: string[] }> {
  if (!Array.isArray(value)) return []
  return value
    .map((attribute) => {
      const record = attribute as { name?: unknown; options?: unknown }
      return {
        name: typeof record.name === 'string' ? record.name : '',
        options: Array.isArray(record.options) ? record.options.map(String) : [],
      }
    })
    .filter((attribute) => attribute.name && attribute.options.length > 0)
}

function getVariants(value: unknown): Array<{ sku?: string; price?: string | number; stock_quantity?: string | number; attributes?: Record<string, string> }> {
  return Array.isArray(value) ? value as Array<{ sku?: string; price?: string | number; stock_quantity?: string | number; attributes?: Record<string, string> }> : []
}

async function compressImageToJpeg(file: File, cropSquare = false) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Image compression failed.')
  }

  const targetBytes = 200 * 1024
  let maxSide = 1400
  let quality = 0.84
  let bestBlob: Blob | null = null

  const renderBlob = () => new Promise<Blob>((resolve, reject) => {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    canvas.width = cropSquare ? Math.max(1, Math.round(Math.min(bitmap.width, bitmap.height) * scale)) : Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = cropSquare ? canvas.width : Math.max(1, Math.round(bitmap.height * scale))
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (cropSquare) {
      const sourceSize = Math.min(bitmap.width, bitmap.height)
      context.drawImage(
        bitmap,
        Math.round((bitmap.width - sourceSize) / 2),
        Math.round((bitmap.height - sourceSize) / 2),
        sourceSize,
        sourceSize,
        0,
        0,
        canvas.width,
        canvas.height
      )
    } else {
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    }
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob)
      } else {
        reject(new Error('Image compression failed.'))
      }
    }, 'image/jpeg', 0.84)
  })

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      canvas.width = cropSquare ? Math.max(1, Math.round(Math.min(bitmap.width, bitmap.height) * scale)) : Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = cropSquare ? canvas.width : Math.max(1, Math.round(bitmap.height * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (cropSquare) {
        const sourceSize = Math.min(bitmap.width, bitmap.height)
        context.drawImage(
          bitmap,
          Math.round((bitmap.width - sourceSize) / 2),
          Math.round((bitmap.height - sourceSize) / 2),
          sourceSize,
          sourceSize,
          0,
          0,
          canvas.width,
          canvas.height
        )
      } else {
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      }
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob)
        } else {
          reject(new Error('Image compression failed.'))
        }
      }, 'image/jpeg', quality)
    })

    bestBlob = blob
    if (blob.size <= targetBytes) break
    if (quality > 0.58) {
      quality -= 0.08
    } else {
      maxSide = Math.max(640, Math.round(maxSide * 0.82))
    }
  }

  bitmap.close()

  const blob = bestBlob ?? await renderBlob()
  if (blob.size > targetBytes) {
    throw new Error('Image must be compressed below 200 KB for WooCommerce publishing.')
  }

  return {
    blob,
    dataUrl: canvas.toDataURL('image/jpeg', quality),
  }
}

export default function ProductsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [syncs, setSyncs] = useState<Record<string, ProductSync[]>>({})
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set())
  const [bulkForm, setBulkForm] = useState<BulkEditForm>({ category: '', selling_price: '', current_stock: '', status: '' })
  const [compressingImage, setCompressingImage] = useState(false)
  const [cropProductImage, setCropProductImage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(makeEmptyForm())
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoriesAvailable, setCategoriesAvailable] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProducts = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [productResult, syncResult, categoryResult] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', currentCompany.id).order('name'),
      supabase
        .from('product_syncs')
        .select('product_id, channel, external_product_id, sync_status, last_synced_at, error_message')
        .eq('company_id', currentCompany.id),
      supabase
        .from('product_categories')
        .select('id, company_id, name')
        .eq('company_id', currentCompany.id)
        .order('name'),
    ])
    const { data, error: loadError } = productResult
    if (loadError) {
      setError(loadError.code === '42P01' ? 'Products database table is required.' : loadError.message)
      setProducts([])
    } else {
      setProducts(((data ?? []) as Product[]).map((product) => ({
        ...product,
        purchase_price: product.purchase_price === null ? null : Number(product.purchase_price),
        selling_price: product.selling_price === null ? null : Number(product.selling_price),
        current_stock: Number(product.current_stock),
        low_stock_threshold: Number(product.low_stock_threshold),
      })))
    }
    if (!syncResult.error) {
      const grouped: Record<string, ProductSync[]> = {}
      for (const sync of (syncResult.data ?? []) as ProductSync[]) {
        grouped[sync.product_id] = [...(grouped[sync.product_id] ?? []), sync]
      }
      setSyncs(grouped)
    } else if (['42P01', 'PGRST205'].includes(syncResult.error.code ?? '')) {
      setSyncs({})
      setError('Product sync database table is required.')
    } else {
      setError(syncResult.error.message)
    }
    if (!categoryResult.error) {
      setCategories((categoryResult.data ?? []) as ProductCategory[])
      setCategoriesAvailable(true)
    } else if (['42P01', '42703', 'PGRST200', 'PGRST205'].includes(categoryResult.error.code ?? '')) {
      setCategories([])
      setCategoriesAvailable(false)
    } else {
      setError(categoryResult.error.message)
    }
    setLoading(false)
  }, [currentCompany, supabase])

  useEffect(() => { void loadProducts() }, [loadProducts])

  useEffect(() => {
    if (currentCompany && !editing) {
      setForm(makeEmptyForm(normalizeCurrencyCode(currentCompany.currency ?? 'EUR')))
    }
  }, [currentCompany, editing])

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => (
      (statusFilter === 'all' || product.status === statusFilter) &&
      (!normalized || [product.name, product.sku, product.barcode, product.category]
        .some((value) => String(value ?? '').toLowerCase().includes(normalized)))
    ))
  }, [products, query, statusFilter])

  const selectedProducts = useMemo(
    () => filteredProducts.filter((product) => selectedProductIds.has(product.id)),
    [filteredProducts, selectedProductIds]
  )

  const resetForm = () => {
    setEditing(null)
    setForm(makeEmptyForm(normalizeCurrencyCode(currentCompany?.currency ?? 'EUR')))
    setShowForm(false)
    setNewCategoryName('')
  }

  const handleEdit = (product: Product) => {
    setEditing(product)
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      category: product.category ?? '',
      description: product.description ?? '',
      purchase_price: product.purchase_price === null ? '' : String(product.purchase_price),
      selling_price: product.selling_price === null ? '' : String(product.selling_price),
      currency: product.currency,
      low_stock_threshold: String(product.low_stock_threshold),
      status: product.status,
      image_url: product.image_url ?? '',
      publish_to_woocommerce: Boolean(product.woo_product_type === 'variable' || product.woo_attributes || product.woo_variants),
      woo_product_type: product.woo_product_type === 'variable' ? 'variable' : 'simple',
      woo_attributes: stringifyJson(product.woo_attributes),
      woo_variants: stringifyJson(product.woo_variants),
    })
    setShowForm(true)
  }

  const handleImageFileChange = async (file: File | null) => {
    if (!file) return
    setMessage('')
    setError('')
    setCompressingImage(true)

    try {
      const { blob, dataUrl } = await compressImageToJpeg(file, cropProductImage)
      const storagePath = currentCompany
        ? `${currentCompany.id}/products/${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}.jpg`
        : ''

      if (storagePath) {
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(storagePath, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          })

        if (!uploadError) {
          const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath)
          setForm((current) => ({ ...current, image_url: data.publicUrl }))
          setMessage(t('products.imageCompressed'))
          return
        }
      }

      setForm((current) => ({ ...current, image_url: dataUrl }))
      setMessage(t('products.imageCompressed'))
    } catch (compressionError) {
      setError(compressionError instanceof Error ? compressionError.message : t('products.imageCompressionFailed'))
    } finally {
      setCompressingImage(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')

    if (!form.name.trim()) {
      setError(t('products.nameRequired'))
      return
    }

    let wooAttributes: unknown[] = []
    let wooVariants: unknown[] = []

    try {
      wooAttributes = parseJsonArray(form.woo_attributes, t('woocommerce.attributesJson'))
      wooVariants = parseJsonArray(form.woo_variants, t('woocommerce.variantsJson'))
    } catch (jsonError) {
      setError(jsonError instanceof Error ? jsonError.message : t('woocommerce.invalidJson'))
      return
    }

    const payload: Record<string, unknown> = {
      company_id: currentCompany.id,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      purchase_price: form.purchase_price === '' ? null : Math.max(0, Number(form.purchase_price)),
      selling_price: form.selling_price === '' ? null : Math.max(0, Number(form.selling_price)),
      currency: normalizeCurrencyCode(form.currency),
      low_stock_threshold: Math.max(0, Number(form.low_stock_threshold) || 0),
      status: form.status,
      updated_at: new Date().toISOString(),
    }
    const matchedCategory = categories.find((category) => category.name === form.category.trim())
    if (categoriesAvailable) {
      payload.category_id = matchedCategory?.id ?? null
    }

    if (form.image_url.trim() || editing?.image_url) {
      payload.image_url = form.image_url.trim() || null
    }
    if (!form.publish_to_woocommerce) {
      payload.woo_product_type = 'simple'
      payload.woo_attributes = []
      payload.woo_variants = []
    } else {
      payload.woo_product_type = form.woo_product_type
      payload.woo_attributes = wooAttributes
      payload.woo_variants = wooVariants
    }

    const result = editing
      ? await supabase.from('products').update(payload).eq('id', editing.id).eq('company_id', currentCompany.id)
      : await supabase.from('products').insert({ ...payload, current_stock: 0 })

    if (result.error) {
      setError(result.error.code === '23505' ? t('products.duplicateCode') : result.error.message)
      return
    }
    setMessage(editing ? t('products.updated') : t('products.created'))
    resetForm()
    await loadProducts()
  }

  const handleCreateCategory = async () => {
    if (!currentCompany || !newCategoryName.trim()) return
    setMessage('')
    setError('')

    const name = newCategoryName.trim()
    const { data, error: categoryError } = await supabase
      .from('product_categories')
      .insert({
        company_id: currentCompany.id,
        name,
        slug: handleFromName(name),
      })
      .select('id, company_id, name')
      .single()

    if (categoryError) {
      setError(categoryError.code === '23505' ? t('products.categoryExists') : categoryError.message)
      return
    }

    const category = data as ProductCategory
    setCategories((current) => [...current, category].sort((left, right) => left.name.localeCompare(right.name)))
    setForm((current) => ({ ...current, category: category.name }))
    setNewCategoryName('')
    setMessage(t('products.categoryCreated'))
  }

  const handleCopyProduct = async (product: Product) => {
    if (!currentCompany) return
    setMessage('')
    setError('')

    const payload: Record<string, unknown> = {
      company_id: currentCompany.id,
      name: `${product.name} ${t('common.copy')}`,
      sku: null,
      barcode: null,
      category: product.category,
      description: product.description,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      currency: product.currency,
      current_stock: 0,
      low_stock_threshold: product.low_stock_threshold,
      status: product.status,
      image_url: product.image_url ?? null,
      woo_product_type: product.woo_product_type ?? 'simple',
      woo_attributes: product.woo_attributes ?? [],
      woo_variants: product.woo_variants ?? [],
    }

    if (categoriesAvailable) {
      payload.category_id = product.category_id ?? null
    }

    const { error: copyError } = await supabase.from('products').insert(payload)

    if (copyError) {
      setError(copyError.message)
      return
    }

    setMessage(t('products.copied'))
    await loadProducts()
  }

  const handleArchive = async (product: Product) => {
    if (!currentCompany) return
    setMessage('')
    setError('')
    const { error: archiveError } = await supabase
      .from('products')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', product.id)
      .eq('company_id', currentCompany.id)

    if (archiveError) {
      setError(archiveError.message)
      return
    }
    setMessage(t('products.updated'))
    await loadProducts()
  }

  const handleWooExport = async (product: Product) => {
    if (!currentCompany) return
    setSyncingProductId(product.id)
    setMessage('')
    setError('')

    const response = await fetch('/api/woocommerce/products/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, productId: product.id }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.syncFailed'))
    } else {
      setMessage(t('woocommerce.syncSuccess'))
    }

    setSyncingProductId(null)
    await loadProducts()
  }

  const handleWooExportAll = async () => {
    if (!currentCompany || filteredProducts.length === 0) return
    setSyncingAll(true)
    setMessage('')
    setError('')
    let completed = true

    for (const product of filteredProducts) {
      setSyncingProductId(product.id)
      const response = await fetch('/api/woocommerce/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, productId: product.id }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error ?? t('woocommerce.syncFailed'))
        completed = false
        break
      }
    }

    setSyncingProductId(null)
    setSyncingAll(false)
    if (completed) {
      setMessage(t('woocommerce.syncSuccess'))
    }
    await loadProducts()
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  const toggleAllVisibleProducts = () => {
    setSelectedProductIds((current) => {
      const allVisibleSelected = filteredProducts.every((product) => current.has(product.id))
      if (allVisibleSelected) return new Set()
      return new Set(filteredProducts.map((product) => product.id))
    })
  }

  const exportProducts = (format: 'generic' | 'woocommerce' | 'shopify' | 'google', list: Product[]) => {
    const productsToExport = list.length > 0 ? list : filteredProducts

    if (productsToExport.length === 0) return

    if (format === 'woocommerce') {
      downloadCsv('leonety-woocommerce-products.csv', [
        ['Type', 'SKU', 'Name', 'Published', 'Visibility in catalog', 'Short description', 'Description', 'Regular price', 'Categories', 'Images', 'Stock', 'Meta: barcode', 'Attribute 1 name', 'Attribute 1 value(s)'],
        ...productsToExport.map((product) => {
          const firstAttribute = getAttributes(product.woo_attributes)[0]
          return [
            product.woo_product_type === 'variable' ? 'variable' : 'simple',
            product.sku,
            product.name,
            1,
            'visible',
            product.category,
            product.description,
            product.selling_price ?? '',
            product.category,
            product.image_url,
            product.current_stock,
            product.barcode,
            firstAttribute?.name ?? '',
            firstAttribute?.options.join('|') ?? '',
          ]
        }),
      ])
      return
    }

    if (format === 'shopify') {
      downloadCsv('leonety-shopify-products.csv', [
        ['Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type', 'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Image Src', 'Status'],
        ...productsToExport.flatMap((product) => {
          const attributes = getAttributes(product.woo_attributes)
          const variants = getVariants(product.woo_variants)
          const option = attributes[0]

          if (variants.length > 0) {
            return variants.map((variant) => [
              handleFromName(product.name),
              product.name,
              product.description,
              '',
              product.category,
              product.category,
              product.barcode,
              'TRUE',
              option?.name ?? 'Title',
              option?.name ? variant.attributes?.[option.name] ?? option.options[0] ?? 'Default Title' : 'Default Title',
              variant.sku ?? product.sku,
              variant.stock_quantity ?? product.current_stock,
              variant.price ?? product.selling_price ?? '',
              product.image_url,
              product.status === 'archived' ? 'archived' : 'active',
            ])
          }

          return [[
            handleFromName(product.name),
            product.name,
            product.description,
            '',
            product.category,
            product.category,
            product.barcode,
            'TRUE',
            'Title',
            'Default Title',
            product.sku,
            product.current_stock,
            product.selling_price ?? '',
            product.image_url,
            product.status === 'archived' ? 'archived' : 'active',
          ]]
        }),
      ])
      return
    }

    if (format === 'google') {
      downloadCsv('leonety-google-products.csv', [
        ['store_code', 'item_id', 'title', 'description', 'price', 'currency', 'quantity', 'availability', 'category', 'link', 'image_link'],
        ...productsToExport.map((product) => [
          currentCompany?.name ?? '',
          product.sku ?? product.id,
          product.name,
          product.description,
          product.selling_price ?? '',
          product.currency,
          product.current_stock,
          product.current_stock > 0 ? 'in stock' : 'out of stock',
          product.category,
          '',
          product.image_url,
        ]),
      ])
      return
    }

    downloadCsv('leonety-products.csv', [
      ['name', 'description', 'sku', 'barcode', 'category', 'price', 'currency', 'stock', 'image_url', 'product_type', 'attributes', 'variants'],
      ...productsToExport.map((product) => [
        product.name,
        product.description,
        product.sku,
        product.barcode,
        product.category,
        product.selling_price ?? '',
        product.currency,
        product.current_stock,
        product.image_url,
        product.woo_product_type ?? 'simple',
        JSON.stringify(product.woo_attributes ?? []),
        JSON.stringify(product.woo_variants ?? []),
      ]),
    ])
  }

  const handleBulkWooSync = async () => {
    if (!currentCompany || selectedProducts.length === 0) return
    setSyncingAll(true)
    setMessage('')
    setError('')

    for (const product of selectedProducts) {
      setSyncingProductId(product.id)
      const response = await fetch('/api/woocommerce/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, productId: product.id }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setError(payload.error ?? t('woocommerce.syncFailed'))
        setSyncingProductId(null)
        setSyncingAll(false)
        await loadProducts()
        return
      }
    }

    setSyncingProductId(null)
    setSyncingAll(false)
    setMessage(t('woocommerce.syncSuccess'))
    await loadProducts()
  }

  const handleBulkEdit = async () => {
    if (!currentCompany || selectedProducts.length === 0) return
    if (!window.confirm(t('products.bulkConfirm'))) return

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (bulkForm.category.trim()) payload.category = bulkForm.category.trim()
    if (categoriesAvailable && bulkForm.category.trim()) {
      payload.category_id = categories.find((category) => category.name === bulkForm.category.trim())?.id ?? null
    }
    if (bulkForm.selling_price.trim()) payload.selling_price = Math.max(0, Number(bulkForm.selling_price) || 0)
    if (bulkForm.current_stock.trim()) payload.current_stock = Math.max(0, Number(bulkForm.current_stock) || 0)
    if (bulkForm.status) payload.status = bulkForm.status

    if (Object.keys(payload).length === 1) {
      setError(t('products.bulkNoChanges'))
      return
    }

    const { error: bulkError } = await supabase
      .from('products')
      .update(payload)
      .eq('company_id', currentCompany.id)
      .in('id', selectedProducts.map((product) => product.id))

    if (bulkError) {
      setError(bulkError.message)
      return
    }

    setBulkForm({ category: '', selling_price: '', current_stock: '', status: '' })
    setSelectedProductIds(new Set())
    setMessage(t('products.bulkUpdated'))
    await loadProducts()
  }

  const renderSyncBadge = (product: Product) => {
    const productSyncs = syncs[product.id] ?? []
    const sync = productSyncs.find((item) => item.channel === 'woocommerce') ?? productSyncs[0]
    const status = sync?.sync_status ?? 'not_synced'
    const className = status === 'synced'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : status === 'pending'
          ? 'bg-blue-100 text-blue-800'
        : 'bg-slate-100 text-slate-600'

    return (
      <div className="flex flex-wrap justify-end gap-1">
        {productSyncs.length === 0 ? (
          <span className={`rounded-full px-2 py-1 text-xs ${className}`}>{t(`woocommerce.syncStatus.${status}`)}</span>
        ) : productSyncs.map((item) => (
          <span key={`${item.product_id}-${item.channel}`} title={item.error_message ?? undefined} className={`rounded-full px-2 py-1 text-xs ${
            item.sync_status === 'synced'
              ? 'bg-green-100 text-green-800'
              : item.sync_status === 'failed'
                ? 'bg-red-100 text-red-800'
                : item.sync_status === 'pending'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-600'
          }`}>
            {item.channel.replace('_', ' ')} · {t(`woocommerce.syncStatus.${item.sync_status}`)}
          </span>
        ))}
      </div>
    )
  }

  const getWooActionLabel = (product: Product) => {
    const sync = (syncs[product.id] ?? []).find((item) => item.channel === 'woocommerce')
    return sync?.external_product_id && sync.sync_status === 'synced'
      ? t('woocommerce.updateProduct')
      : t('woocommerce.publishProduct')
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('products.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('products.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('products.title')} description={`${t('products.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/stock-movements"><Button variant="outline">{t('stock.title')}</Button></Link>
          <Link href="/app/settings/integrations/woocommerce"><Button variant="outline">{t('nav.woocommerce')}</Button></Link>
          <Button variant="outline" onClick={() => exportProducts('generic', filteredProducts)} disabled={filteredProducts.length === 0}>
            <Download className="h-4 w-4" />
            {t('products.exportGeneric')}
          </Button>
          <Button variant="outline" onClick={() => exportProducts('shopify', filteredProducts)} disabled={filteredProducts.length === 0}>
            <Download className="h-4 w-4" />
            {t('products.exportShopify')}
          </Button>
          <Button variant="outline" onClick={() => exportProducts('google', filteredProducts)} disabled={filteredProducts.length === 0}>
            <Download className="h-4 w-4" />
            {t('products.exportGoogle')}
          </Button>
          <Button variant="outline" onClick={() => void handleWooExportAll()} disabled={syncingAll || filteredProducts.length === 0}>
            {syncingAll ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {t('woocommerce.exportAll')}
          </Button>
          <Button onClick={() => showForm ? resetForm() : setShowForm(true)}><PackagePlus className="h-4 w-4" />{showForm ? t('common.cancel') : t('products.add')}</Button>
        </div>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-md border py-2 pl-9 pr-3 text-sm" placeholder={t('products.search')} /></div>
        <AppSelect value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | ProductStatus)} options={[{ value: 'all', label: t('common.all') }, ...productStatuses.map((status) => ({ value: status, label: t(`products.status.${status}`) }))]} />
      </div>

      {filteredProducts.length > 0 && (
        <Card className="mb-5">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={filteredProducts.every((product) => selectedProductIds.has(product.id))} onChange={toggleAllVisibleProducts} />
                {t('products.selectVisible')}
              </label>
              <span className="text-sm text-slate-500">{selectedProducts.length} {t('products.selected')}</span>
            </div>

            {selectedProducts.length > 0 && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => exportProducts('generic', selectedProducts)}><Download className="h-4 w-4" />{t('products.exportGeneric')}</Button>
                  <Button variant="outline" onClick={() => exportProducts('woocommerce', selectedProducts)}><Download className="h-4 w-4" />{t('products.exportWooCsv')}</Button>
                  <Button variant="outline" onClick={() => exportProducts('shopify', selectedProducts)}><Download className="h-4 w-4" />{t('products.exportShopify')}</Button>
                  <Button variant="outline" onClick={() => exportProducts('google', selectedProducts)}><Download className="h-4 w-4" />{t('products.exportGoogle')}</Button>
                  <Button variant="outline" onClick={() => void handleBulkWooSync()} disabled={syncingAll}><UploadCloud className="h-4 w-4" />{t('products.bulkSyncWoo')}</Button>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {categoriesAvailable && categories.length > 0 ? (
                    <AppSelect value={bulkForm.category} onChange={(value) => setBulkForm({ ...bulkForm, category: value })} options={[{ value: '', label: t('products.keepCategory') }, ...categories.map((category) => ({ value: category.name, label: category.name }))]} />
                  ) : (
                    <input value={bulkForm.category} onChange={(event) => setBulkForm({ ...bulkForm, category: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.category')} />
                  )}
                  <input type="number" min="0" step="0.01" value={bulkForm.selling_price} onChange={(event) => setBulkForm({ ...bulkForm, selling_price: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.sellingPrice')} />
                  <input type="number" min="0" step="0.001" value={bulkForm.current_stock} onChange={(event) => setBulkForm({ ...bulkForm, current_stock: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.currentStock')} />
                  <AppSelect value={bulkForm.status} onChange={(value) => setBulkForm({ ...bulkForm, status: value as '' | ProductStatus })} options={[{ value: '', label: t('products.keepStatus') }, ...productStatuses.map((status) => ({ value: status, label: t(`products.status.${status}`) }))]} />
                  <Button type="button" onClick={() => void handleBulkEdit()}>{t('products.applyBulkEdit')}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editing ? t('products.edit') : t('products.add')}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.name')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.sku')}</span><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.barcode')}</span><div className="relative"><Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full rounded-md border py-2 pl-9 pr-3" /></div></label>
              <div className="space-y-1">
                <span className="text-sm font-medium">{t('products.category')}</span>
                {categoriesAvailable && categories.length > 0 ? (
                  <AppSelect
                    value={form.category}
                    onChange={(value) => setForm({ ...form, category: value })}
                    options={[{ value: '', label: t('products.noCategory') }, ...categories.map((category) => ({ value: category.name, label: category.name }))]}
                  />
                ) : (
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border px-3 py-2" />
                )}
                {categoriesAvailable && (
                  <div className="flex gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
                      placeholder={t('products.newCategory')}
                    />
                    <Button type="button" variant="outline" onClick={() => void handleCreateCategory()} disabled={!newCategoryName.trim()}>
                      {t('products.createCategory')}
                    </Button>
                  </div>
                )}
              </div>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.purchasePrice')}</span><input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.sellingPrice')}</span><input type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('common.currency')}</span><AppSelect value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={currencyOptions.map((item) => ({ value: item.code, label: `${item.code} - ${item.label}` }))} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.lowStockThreshold')}</span><input type="number" min="0" step="0.001" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.status')}</span><AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as ProductStatus })} options={productStatuses.map((status) => ({ value: status, label: t(`products.status.${status}`) }))} /></label>
              <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('woocommerce.imageUrl')}</span><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="https://example.com/product.jpg" /></label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.uploadImage')}</span>
                <label className="mb-2 flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cropProductImage}
                    onChange={(event) => setCropProductImage(event.target.checked)}
                    className="h-4 w-4"
                  />
                  {t('products.cropSquare')}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handleImageFileChange(event.target.files?.[0] ?? null)}
                  className="block w-full cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:bg-slate-100"
                />
                <span className="text-xs text-slate-500">{compressingImage ? t('products.compressingImage') : t('products.jpgOnly')}</span>
              </label>
              {form.image_url && (
                <div className="space-y-1">
                  <span className="text-sm font-medium">{t('products.imagePreview')}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image_url} alt="" className="h-24 w-24 rounded-md border object-cover" />
                </div>
              )}
              <label className="space-y-1 md:col-span-2 xl:col-span-3"><span className="text-sm font-medium">{t('products.descriptionField')}</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20 w-full rounded-md border px-3 py-2" /></label>
              <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 md:col-span-2 xl:col-span-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.publish_to_woocommerce}
                    onChange={(event) => setForm({ ...form, publish_to_woocommerce: event.target.checked })}
                    className="h-4 w-4"
                  />
                  {t('products.publishWoo')}
                </label>
                {['Google Business / Merchant', 'WhatsApp Business Catalog', 'OpenCart / Lieferando / Uber Eats'].map((label) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-slate-400">
                    <input type="checkbox" disabled className="h-4 w-4" />
                    {label} · {t('integrations.comingSoon')}
                  </label>
                ))}
              </div>
              {form.publish_to_woocommerce && (
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('woocommerce.productType')}</span>
                  <AppSelect value={form.woo_product_type} onChange={(value) => setForm({ ...form, woo_product_type: value as 'simple' | 'variable' })} options={[{ value: 'simple', label: t('woocommerce.simpleProduct') }, { value: 'variable', label: t('woocommerce.variableProduct') }]} />
                </label>
              )}
              {form.publish_to_woocommerce && form.woo_product_type === 'variable' && (
                <>
                  <label className="space-y-1 md:col-span-2 xl:col-span-3">
                    <span className="text-sm font-medium">{t('woocommerce.attributesJson')}</span>
                    <textarea value={form.woo_attributes} onChange={(e) => setForm({ ...form, woo_attributes: e.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2 font-mono text-xs" placeholder='[{"name":"Size","options":["S","M","L"]}]' />
                  </label>
                  <label className="space-y-1 md:col-span-2 xl:col-span-3">
                    <span className="text-sm font-medium">{t('woocommerce.variantsJson')}</span>
                    <textarea value={form.woo_variants} onChange={(e) => setForm({ ...form, woo_variants: e.target.value })} className="min-h-28 w-full rounded-md border px-3 py-2 font-mono text-xs" placeholder='[{"sku":"TS-S-BLACK","price":19.99,"stock_quantity":5,"attributes":{"Size":"S","Color":"Black"}}]' />
                    <span className="text-xs text-slate-500">{t('woocommerce.jsonHelp')}</span>
                  </label>
                </>
              )}
              <div className="flex gap-2 md:col-span-2 xl:col-span-3"><Button type="submit">{t('common.save')}</Button><Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {filteredProducts.length === 0 ? (
        <EmptyState title={t('products.empty')} description={t('products.emptyDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const lowStock = product.status === 'active' && product.current_stock <= product.low_stock_threshold
            return (
              <Card key={product.id} className={lowStock ? 'border-amber-300' : ''}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelection(product.id)} className="mt-1" aria-label={`Select ${product.name}`} />
                      <div>
                        {product.image_url && <img src={product.image_url} alt="" className="mb-2 h-14 w-14 rounded-md border object-cover" />}
                        <h2 className="font-semibold">{product.name}</h2>
                        <p className="text-sm text-slate-500">{[product.sku, product.barcode].filter(Boolean).join(' · ') || t('products.noCode')}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-1 text-xs ${lowStock ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}>{lowStock ? t('products.lowStock') : t(`products.status.${product.status}`)}</span>
                      {renderSyncBadge(product)}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-slate-500">{t('products.currentStock')}</p><p className="text-lg font-semibold">{product.current_stock}</p></div>
                    <div><p className="text-slate-500">{t('products.sellingPrice')}</p><p className="font-medium">{product.selling_price === null ? '—' : formatCurrency(product.selling_price, product.currency)}</p></div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setViewingProduct(product)}>{t('products.view')}</Button>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(product)}><Edit className="h-4 w-4" />{t('common.edit')}</Button>
                    <Button size="sm" variant="outline" onClick={() => void handleCopyProduct(product)}><Copy className="h-4 w-4" />{t('common.copy')}</Button>
                    <Button size="sm" variant="outline" disabled={syncingProductId === product.id} onClick={() => void handleWooExport(product)}>
                      {syncingProductId === product.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      {getWooActionLabel(product)}
                    </Button>
                    {product.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => void handleArchive(product)}><Archive className="h-4 w-4" />{t('products.archive')}</Button>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {viewingProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="grid gap-0 md:grid-cols-[260px_1fr]">
              <div className="bg-slate-50 p-5">
                {viewingProduct.image_url ? (
                  <img src={viewingProduct.image_url} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg border bg-white text-sm text-slate-400">
                    {t('products.imagePreview')}
                  </div>
                )}
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{viewingProduct.name}</h2>
                    <p className="text-sm text-slate-500">{[viewingProduct.sku, viewingProduct.barcode, viewingProduct.category].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button type="button" className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={() => setViewingProduct(null)}>
                    ×
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-slate-500">{t('products.sellingPrice')}</p>
                    <p className="font-semibold">{viewingProduct.selling_price === null ? '-' : formatCurrency(viewingProduct.selling_price, viewingProduct.currency)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-slate-500">{t('products.currentStock')}</p>
                    <p className="font-semibold">{viewingProduct.current_stock}</p>
                  </div>
                </div>
                {viewingProduct.description && <p className="whitespace-pre-line text-sm text-slate-700">{viewingProduct.description}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => { handleEdit(viewingProduct); setViewingProduct(null) }}>{t('common.edit')}</Button>
                  <Button variant="outline" disabled={syncingProductId === viewingProduct.id} onClick={() => void handleWooExport(viewingProduct)}>
                    {syncingProductId === viewingProduct.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {getWooActionLabel(viewingProduct)}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
