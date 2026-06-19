'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Barcode, BriefcaseBusiness, Building2, Edit, PackagePlus, RefreshCw, Search, UploadCloud } from 'lucide-react'
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
  woo_product_type: 'simple' | 'variable'
  woo_attributes: string
  woo_variants: string
}

interface ProductSync {
  product_id: string
  woo_product_id: number | null
  sync_status: 'not_synced' | 'synced' | 'error'
  last_sync_at: string | null
  error_message: string | null
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

export default function ProductsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [products, setProducts] = useState<Product[]>([])
  const [syncs, setSyncs] = useState<Record<string, ProductSync>>({})
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(makeEmptyForm())
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
    const [productResult, syncResult] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', currentCompany.id).order('name'),
      supabase.from('product_syncs').select('product_id, woo_product_id, sync_status, last_sync_at, error_message').eq('company_id', currentCompany.id),
    ])
    const { data, error: loadError } = productResult
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
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
      setSyncs(Object.fromEntries(((syncResult.data ?? []) as ProductSync[]).map((sync) => [sync.product_id, sync])))
    } else if (syncResult.error.code !== '42P01') {
      setError(syncResult.error.message)
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

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

  const resetForm = () => {
    setEditing(null)
    setForm(makeEmptyForm(normalizeCurrencyCode(currentCompany?.currency ?? 'EUR')))
    setShowForm(false)
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
      woo_product_type: product.woo_product_type === 'variable' ? 'variable' : 'simple',
      woo_attributes: stringifyJson(product.woo_attributes),
      woo_variants: stringifyJson(product.woo_variants),
    })
    setShowForm(true)
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

    if (form.image_url.trim() || editing?.image_url) {
      payload.image_url = form.image_url.trim() || null
    }
    if (form.woo_product_type !== 'simple' || editing?.woo_product_type) {
      payload.woo_product_type = form.woo_product_type
    }
    if (form.woo_attributes.trim() || editing?.woo_attributes) {
      payload.woo_attributes = wooAttributes
    }
    if (form.woo_variants.trim() || editing?.woo_variants) {
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

  const renderSyncBadge = (product: Product) => {
    const sync = syncs[product.id]
    const status = sync?.sync_status ?? 'not_synced'
    const className = status === 'synced'
      ? 'bg-green-100 text-green-800'
      : status === 'error'
        ? 'bg-red-100 text-red-800'
        : 'bg-slate-100 text-slate-600'

    return (
      <span title={sync?.error_message ?? undefined} className={`rounded-full px-2 py-1 text-xs ${className}`}>
        {t(`woocommerce.syncStatus.${status}`)}
      </span>
    )
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('products.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('products.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('products.title')} description={`${t('products.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock-movements"><Button variant="outline">{t('stock.title')}</Button></Link>
          <Link href="/settings/integrations/woocommerce"><Button variant="outline">{t('nav.woocommerce')}</Button></Link>
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
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.category')}</span><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.purchasePrice')}</span><input type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.sellingPrice')}</span><input type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('common.currency')}</span><AppSelect value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={currencyOptions.map((item) => ({ value: item.code, label: `${item.code} - ${item.label}` }))} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.lowStockThreshold')}</span><input type="number" min="0" step="0.001" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('products.status')}</span><AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as ProductStatus })} options={productStatuses.map((status) => ({ value: status, label: t(`products.status.${status}`) }))} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('woocommerce.productType')}</span><AppSelect value={form.woo_product_type} onChange={(value) => setForm({ ...form, woo_product_type: value as 'simple' | 'variable' })} options={[{ value: 'simple', label: t('woocommerce.simpleProduct') }, { value: 'variable', label: t('woocommerce.variableProduct') }]} /></label>
              <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('woocommerce.imageUrl')}</span><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="https://example.com/product.jpg" /></label>
              <label className="space-y-1 md:col-span-2 xl:col-span-3"><span className="text-sm font-medium">{t('products.descriptionField')}</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-20 w-full rounded-md border px-3 py-2" /></label>
              {form.woo_product_type === 'variable' && (
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
                    <div><h2 className="font-semibold">{product.name}</h2><p className="text-sm text-slate-500">{[product.sku, product.barcode].filter(Boolean).join(' · ') || t('products.noCode')}</p></div>
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
                    <Button size="sm" variant="outline" onClick={() => handleEdit(product)}><Edit className="h-4 w-4" />{t('common.edit')}</Button>
                    <Button size="sm" variant="outline" disabled={syncingProductId === product.id} onClick={() => void handleWooExport(product)}>
                      {syncingProductId === product.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                      {t('woocommerce.exportProduct')}
                    </Button>
                    {product.status !== 'archived' && <Button size="sm" variant="outline" onClick={() => void handleArchive(product)}><Archive className="h-4 w-4" />{t('products.archive')}</Button>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
