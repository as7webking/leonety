'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Barcode, BriefcaseBusiness, Building2, Plus, Save, UploadCloud } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ProductImageWorkspace } from '@/components/products/product-image-workspace'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'

const productStatuses = ['active', 'inactive', 'archived'] as const
type ProductStatus = typeof productStatuses[number]
type ProductEditorSection = 'general' | 'pricing' | 'inventory' | 'image' | 'integration' | 'advanced'
type ProductChannel =
  | 'woocommerce'
  | 'shopify'
  | 'opencart'
  | 'google_merchant'
  | 'facebook_instagram'
  | 'tiktok_shop'
  | 'ebay'
  | 'amazon_marketplace'
  | 'kleinanzeigen'
  | 'olx'
  | 'uber_eats'
  | 'just_eat_takeaway'
  | 'glovo'
  | 'iss_pos'

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
  updated_at?: string | null
}

interface ProductCategory {
  id: string
  company_id: string
  name: string
}

interface ProductSync {
  product_id: string
  channel: ProductChannel
  external_product_id: string | null
  sync_status: 'not_synced' | 'pending' | 'synced' | 'failed'
  last_synced_at: string | null
  error_message: string | null
}

interface StoreConnectionStatus {
  provider: ProductChannel
  status: 'not_connected' | 'connected' | 'error' | 'disabled'
  lastSyncAt: string | null
}

interface ChannelOverride {
  title: string
  description: string
  category: string
  price: string
}

interface ProductChannelPreference {
  provider: ProductChannel
  publish_requested: boolean
  overrides: Partial<ChannelOverride> | null
}

interface PublishResult {
  channel: ProductChannel
  status: 'published' | 'needs_action' | 'failed' | 'not_connected'
  message: string
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

const productEditorSections: ProductEditorSection[] = ['general', 'pricing', 'inventory', 'image', 'integration', 'advanced']

const productChannels: Array<{
  channel: ProductChannel
  labelKey: string
  publishKey: string
  operational: boolean
}> = [
  { channel: 'woocommerce', labelKey: 'integrations.woocommerce', publishKey: 'products.publishChannel.woocommerce', operational: true },
  { channel: 'google_merchant', labelKey: 'integrations.googleMerchant', publishKey: 'products.publishChannel.googleMerchant', operational: false },
  { channel: 'facebook_instagram', labelKey: 'integrations.facebookInstagram', publishKey: 'products.publishChannel.facebookInstagram', operational: false },
  { channel: 'tiktok_shop', labelKey: 'integrations.tiktokShop', publishKey: 'products.publishChannel.tiktokShop', operational: false },
  { channel: 'ebay', labelKey: 'integrations.ebay', publishKey: 'products.publishChannel.ebay', operational: false },
  { channel: 'amazon_marketplace', labelKey: 'integrations.amazonMarketplace', publishKey: 'products.publishChannel.amazonMarketplace', operational: false },
  { channel: 'kleinanzeigen', labelKey: 'integrations.kleinanzeigen', publishKey: 'products.publishChannel.kleinanzeigen', operational: false },
  { channel: 'olx', labelKey: 'integrations.olx', publishKey: 'products.publishChannel.olx', operational: false },
  { channel: 'uber_eats', labelKey: 'integrations.uberEats', publishKey: 'products.publishChannel.uberEats', operational: false },
  { channel: 'just_eat_takeaway', labelKey: 'integrations.justEatTakeaway', publishKey: 'products.publishChannel.justEatTakeaway', operational: false },
  { channel: 'glovo', labelKey: 'integrations.glovo', publishKey: 'products.publishChannel.glovo', operational: false },
  { channel: 'iss_pos', labelKey: 'integrations.issPos', publishKey: 'products.publishChannel.issPos', operational: false },
]

const migrationMissingCodes = ['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205']

function emptyChannelOverride(): ChannelOverride {
  return {
    title: '',
    description: '',
    category: '',
    price: '',
  }
}

function hasSchemaMissingCode(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && migrationMissingCodes.includes(error.code ?? ''))
}

function stringifyJson(value: unknown) {
  if (!value || (Array.isArray(value) && value.length === 0)) return ''
  return JSON.stringify(value, null, 2)
}

function parseJsonArray(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) throw new Error('invalid_json_array')
  return parsed
}

function decodeHtmlText(value: string) {
  if (!value) return ''
  const withoutTags = value.replace(/<[^>]*>/g, ' ')
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null
  if (!textarea) {
    return withoutTags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }

  textarea.innerHTML = withoutTags
  return textarea.value.replace(/\s+/g, ' ').trim()
}

function handleFromName(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product'
}

function formFromProduct(product: Product): ProductForm {
  return {
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    category: product.category ?? '',
    description: decodeHtmlText(product.description ?? ''),
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
  }
}

export default function ProductEditPage() {
  const params = useParams<{ productId?: string }>()
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const productId = typeof params.productId === 'string' ? params.productId : ''

  const [product, setProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [syncs, setSyncs] = useState<ProductSync[]>([])
  const [storeConnections, setStoreConnections] = useState<Record<ProductChannel, StoreConnectionStatus>>({} as Record<ProductChannel, StoreConnectionStatus>)
  const [selectedPublishChannels, setSelectedPublishChannels] = useState<ProductChannel[]>([])
  const [channelOverrides, setChannelOverrides] = useState<Partial<Record<ProductChannel, ChannelOverride>>>({})
  const [publishResults, setPublishResults] = useState<PublishResult[]>([])
  const [publishingChannels, setPublishingChannels] = useState(false)
  const [channelPreferencesAvailable, setChannelPreferencesAvailable] = useState(true)
  const [categoriesAvailable, setCategoriesAvailable] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editorSection, setEditorSection] = useState<ProductEditorSection>('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadProduct = useCallback(async () => {
    if (!currentCompany || !productId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [productResult, categoryResult, syncResult, integrationResult, preferenceResult] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('company_id', currentCompany.id)
        .maybeSingle(),
      supabase
        .from('product_categories')
        .select('id, company_id, name')
        .eq('company_id', currentCompany.id)
        .order('name'),
      supabase
        .from('product_syncs')
        .select('product_id, channel, external_product_id, sync_status, last_synced_at, error_message')
        .eq('company_id', currentCompany.id)
        .eq('product_id', productId),
      fetch(`/api/store-integrations?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : { integrations: [] })
        .catch(() => ({ integrations: [] })),
      supabase
        .from('product_channel_preferences')
        .select('provider, publish_requested, overrides')
        .eq('company_id', currentCompany.id)
        .eq('product_id', productId),
    ])

    if (productResult.error) {
      setError(productResult.error.message)
      setProduct(null)
      setForm(null)
    } else if (!productResult.data) {
      setProduct(null)
      setForm(null)
    } else {
      const normalizedProduct = {
        ...(productResult.data as Product),
        purchase_price: productResult.data.purchase_price === null ? null : Number(productResult.data.purchase_price),
        selling_price: productResult.data.selling_price === null ? null : Number(productResult.data.selling_price),
        current_stock: Number(productResult.data.current_stock),
        low_stock_threshold: Number(productResult.data.low_stock_threshold),
      }
      setProduct(normalizedProduct)
      setForm(formFromProduct(normalizedProduct))
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

    const loadedSyncs = !syncResult.error ? (syncResult.data ?? []) as ProductSync[] : []

    if (!syncResult.error) {
      setSyncs(loadedSyncs)
    }

    if (!preferenceResult.error) {
      const preferences = (preferenceResult.data ?? []) as ProductChannelPreference[]
      setChannelPreferencesAvailable(true)
      setSelectedPublishChannels(preferences.filter((preference) => preference.publish_requested).map((preference) => preference.provider))
      setChannelOverrides(preferences.reduce<Partial<Record<ProductChannel, ChannelOverride>>>((acc, preference) => {
        if (preference.overrides) {
          acc[preference.provider] = {
            ...emptyChannelOverride(),
            ...preference.overrides,
          }
        }
        return acc
      }, {}))
    } else if (hasSchemaMissingCode(preferenceResult.error)) {
      setChannelPreferencesAvailable(false)
      setSelectedPublishChannels(loadedSyncs.filter((sync) => Boolean(sync.external_product_id)).map((sync) => sync.channel))
      setChannelOverrides({})
    } else {
      setError(preferenceResult.error.message)
    }

    const connectionMap = {} as Record<ProductChannel, StoreConnectionStatus>
    for (const integration of (integrationResult.integrations ?? []) as Array<{ provider?: ProductChannel; status?: StoreConnectionStatus['status']; lastSyncAt?: string | null }>) {
      if (!integration.provider) continue
      connectionMap[integration.provider] = {
        provider: integration.provider,
        status: integration.status ?? 'not_connected',
        lastSyncAt: integration.lastSyncAt ?? null,
      }
    }
    setStoreConnections(connectionMap)
    setLoading(false)
  }, [currentCompany, productId, supabase])

  useEffect(() => {
    // Product edit stays client-side here so it can reuse the existing company/session hooks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProduct()
  }, [loadProduct])

  const matchedCategory = useMemo(
    () => categories.find((category) => category.name === form?.category.trim()),
    [categories, form?.category]
  )

  const availablePublishChannels = useMemo(
    () => productChannels
      .filter((channel) => channel.operational && storeConnections[channel.channel]?.status === 'connected')
      .map((channel) => channel.channel),
    [storeConnections]
  )

  function togglePublishChannel(channel: ProductChannel, checked: boolean) {
    setSelectedPublishChannels((current) => {
      if (checked) return Array.from(new Set([...current, channel]))
      return current.filter((item) => item !== channel)
    })

    if (channel === 'woocommerce' && form) {
      setForm({ ...form, publish_to_woocommerce: checked })
    }
  }

  function updateChannelOverride(channel: ProductChannel, patch: Partial<ChannelOverride>) {
    setChannelOverrides((current) => ({
      ...current,
      [channel]: {
        ...emptyChannelOverride(),
        ...(current[channel] ?? {}),
        ...patch,
      },
    }))
  }

  function validateChannel(channel: ProductChannel) {
    if (!form) return [t('products.channelMissingName')]
    const override = channelOverrides[channel]
    const title = override?.title.trim() || form.name.trim()
    const description = override?.description.trim() || form.description.trim()
    const category = override?.category.trim() || form.category.trim()
    const price = override?.price.trim() || form.selling_price.trim()
    const issues: string[] = []

    if (!title) issues.push(t('products.channelMissingName'))
    if (!price || Number(price) <= 0) issues.push(t('products.channelMissingPrice'))
    if (['ebay', 'amazon_marketplace', 'kleinanzeigen', 'olx', 'uber_eats', 'just_eat_takeaway', 'glovo'].includes(channel) && !category) {
      issues.push(t('products.channelMissingCategory'))
    }
    if (['amazon_marketplace'].includes(channel) && !form.barcode.trim()) {
      issues.push(t('products.channelMissingEan'))
    }
    if (['ebay', 'amazon_marketplace', 'kleinanzeigen', 'olx'].includes(channel) && !description) {
      issues.push(t('products.channelMissingDescription'))
    }

    return issues
  }

  async function saveChannelPreferences(productIdToSave: string) {
    if (!currentCompany) return true

    const rows = productChannels.map((channel) => ({
      company_id: currentCompany.id,
      product_id: productIdToSave,
      provider: channel.channel,
      publish_requested: selectedPublishChannels.includes(channel.channel),
      overrides: channelOverrides[channel.channel] ?? {},
      updated_at: new Date().toISOString(),
    }))

    const { error: preferenceError } = await supabase
      .from('product_channel_preferences')
      .upsert(rows, { onConflict: 'company_id,product_id,provider' })

    if (hasSchemaMissingCode(preferenceError)) {
      setChannelPreferencesAvailable(false)
      return false
    }

    if (preferenceError) throw preferenceError
    setChannelPreferencesAvailable(true)
    return true
  }

  async function publishChannels(channels: ProductChannel[]) {
    if (!currentCompany || !product || !form || publishingChannels) return

    const uniqueChannels = Array.from(new Set(channels))
    if (uniqueChannels.length === 0) {
      setError(t('products.noAvailablePublishChannels'))
      return
    }

    setPublishingChannels(true)
    setMessage('')
    setError('')

    const results: PublishResult[] = []

    for (const channel of uniqueChannels) {
      const config = productChannels.find((item) => item.channel === channel)
      const connection = storeConnections[channel]
      const label = config ? t(config.labelKey) : channel

      if (connection?.status !== 'connected') {
        results.push({ channel, status: 'not_connected', message: t('products.connectIntegration') })
        continue
      }

      if (!config?.operational) {
        results.push({ channel, status: 'needs_action', message: t('products.channelApprovalRequired') })
        continue
      }

      const issues = validateChannel(channel)
      if (issues.length > 0) {
        results.push({ channel, status: 'needs_action', message: issues.join(', ') })
        continue
      }

      if (channel === 'woocommerce') {
        const response = await fetch('/api/woocommerce/products/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: currentCompany.id, productId: product.id }),
        })
        const payload = await response.json().catch(() => ({}))

        if (response.ok) {
          results.push({ channel, status: 'published', message: t('products.channelPublished') })
        } else {
          results.push({ channel, status: 'failed', message: payload.error ?? t('products.channelFailed') })
        }
        continue
      }

      results.push({ channel, status: 'needs_action', message: `${label}: ${t('products.channelApprovalRequired')}` })
    }

    setPublishResults(results)
    setMessage(t('products.publishResultsReady'))
    setPublishingChannels(false)
    await loadProduct()
  }

  const handleCreateCategory = async () => {
    if (!currentCompany || !form || !newCategoryName.trim()) return
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
    setForm({ ...form, category: category.name })
    setNewCategoryName('')
    setMessage(t('products.categoryCreated'))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany || !form || !product) return
    setSaving(true)
    setMessage('')
    setError('')

    if (!form.name.trim()) {
      setError(t('products.nameRequired'))
      setSaving(false)
      return
    }

    let wooAttributes: unknown[] = []
    let wooVariants: unknown[] = []

    try {
      wooAttributes = parseJsonArray(form.woo_attributes)
      wooVariants = parseJsonArray(form.woo_variants)
    } catch {
      setError(t('woocommerce.invalidJson'))
      setSaving(false)
      return
    }

    const payload: Record<string, unknown> = {
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
      image_url: form.image_url.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (categoriesAvailable) {
      payload.category_id = matchedCategory?.id ?? null
    }

    const publishWooCommerce = form.publish_to_woocommerce || selectedPublishChannels.includes('woocommerce')

    if (!publishWooCommerce) {
      payload.woo_product_type = 'simple'
      payload.woo_attributes = []
      payload.woo_variants = []
    } else {
      payload.woo_product_type = form.woo_product_type
      payload.woo_attributes = wooAttributes
      payload.woo_variants = wooVariants
    }

    const { error: updateError } = await supabase
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .eq('company_id', currentCompany.id)

    if (updateError) {
      setError(updateError.code === '23505' ? t('products.duplicateCode') : updateError.message)
      setSaving(false)
      return
    }

    let shouldReload = true
    try {
      const preferencesSaved = await saveChannelPreferences(product.id)
      setMessage(preferencesSaved ? t('products.updated') : `${t('products.updated')} ${t('products.channelPreferencesMigrationRequired')}`)
    } catch {
      setError(t('products.channelPreferencesSaveFailed'))
      shouldReload = false
    }

    setSaving(false)
    if (shouldReload) await loadProduct()
  }

  const goBack = () => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push('/app/products')
  }

  if (companyLoading || loading) {
    return <PageContainer><PageHeader title={t('products.edit')} /><LoadingSkeleton /></PageContainer>
  }

  if (!currentCompany) {
    return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} /></PageContainer>
  }

  if (currentCompany.type !== 'business') {
    return <PageContainer><PageHeader title={t('products.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>
  }

  if (!product || !form) {
    return (
      <PageContainer>
        <PageHeader title={t('products.edit')} />
        <EmptyState title={t('products.notFound')} description={t('products.notFoundDescription')} action={{ label: t('products.backToProducts'), onClick: () => router.push('/app/products') }} />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="pb-28">
      <PageHeader title={t('products.edit')} description={`${product.name} · ${currentCompany.name}`}>
        <Button type="button" variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4" />
          {t('products.backToProducts')}
        </Button>
      </PageHeader>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex gap-2 overflow-x-auto">
              {productEditorSections.map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setEditorSection(section)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
                    editorSection === section ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t(`products.editor.${section}`)}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {editorSection === 'general' && (
          <Card>
            <CardHeader><CardTitle>{t('products.editor.general')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.name')}</span>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.sku')}</span>
                <input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.barcode')}</span>
                <div className="relative">
                  <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} className="w-full rounded-md border py-2 pl-9 pr-3 text-base sm:text-sm" />
                </div>
              </label>
              <div className="space-y-1">
                <span className="text-sm font-medium">{t('products.category')}</span>
                {categoriesAvailable && categories.length > 0 ? (
                  <AppSelect
                    value={form.category}
                    onChange={(value) => setForm({ ...form, category: value })}
                    options={[{ value: '', label: t('products.noCategory') }, ...categories.map((category) => ({ value: category.name, label: category.name }))]}
                  />
                ) : (
                  <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
                )}
                {categoriesAvailable && (
                  <div className="flex min-w-0 gap-2">
                    <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" placeholder={t('products.newCategory')} />
                    <Button type="button" variant="outline" onClick={() => void handleCreateCategory()} disabled={!newCategoryName.trim()}>
                      <Plus className="h-4 w-4" />
                      {t('products.createCategory')}
                    </Button>
                  </div>
                )}
              </div>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm font-medium">{t('products.descriptionField')}</span>
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-32 w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
              </label>
            </CardContent>
          </Card>
        )}

        {editorSection === 'pricing' && (
          <Card>
            <CardHeader><CardTitle>{t('products.editor.pricing')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.purchasePrice')}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.purchase_price} onChange={(event) => setForm({ ...form, purchase_price: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.sellingPrice')}</span>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={form.selling_price} onChange={(event) => setForm({ ...form, selling_price: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('common.currency')}</span>
                <AppSelect value={form.currency} onChange={(value) => setForm({ ...form, currency: value })} options={currencyOptions.map((item) => ({ value: item.code, label: `${item.code} - ${item.label}` }))} />
              </label>
            </CardContent>
          </Card>
        )}

        {editorSection === 'inventory' && (
          <Card>
            <CardHeader><CardTitle>{t('products.editor.inventory')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.lowStockThreshold')}</span>
                <input type="number" min="0" step="0.001" inputMode="decimal" value={form.low_stock_threshold} onChange={(event) => setForm({ ...form, low_stock_threshold: event.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('products.status')}</span>
                <AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as ProductStatus })} options={productStatuses.map((status) => ({ value: status, label: t(`products.status.${status}`) }))} />
              </label>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 md:col-span-2">
                {t('products.stockManagedByMovements')}
              </div>
              <Link href="/app/stock-movements" className="md:col-span-2">
                <Button type="button" variant="outline">{t('products.adjustStock')}</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {editorSection === 'image' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('products.imageWorkspace')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductImageWorkspace
                companyId={currentCompany.id}
                productName={form.name}
                value={form.image_url}
                onChange={(imageUrl) => setForm({ ...form, image_url: imageUrl })}
                t={t}
                onMessage={setMessage}
                onError={setError}
              />
            </CardContent>
          </Card>
        )}

        {editorSection === 'integration' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('products.channelsTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">{t('products.channelsDescription')}</p>
              {!channelPreferencesAvailable && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {t('products.channelPreferencesMigrationRequired')}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {productChannels.map((channel) => {
                  const connection = storeConnections[channel.channel]
                  const sync = syncs.find((item) => item.channel === channel.channel)
                  const connected = connection?.status === 'connected'
                  const published = Boolean(sync?.external_product_id)
                  const disabled = !connected || !channel.operational
                  const requested = selectedPublishChannels.includes(channel.channel)
                  return (
                    <div key={channel.channel} className="rounded-lg border border-slate-200 p-3">
                      <label className={`flex items-start gap-2 text-sm ${disabled ? 'text-slate-400' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={requested}
                          disabled={disabled}
                          onChange={(event) => {
                            togglePublishChannel(channel.channel, event.target.checked)
                          }}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{t(channel.publishKey)}</span>
                          <span className="block text-xs">
                            {connected ? t('integrations.connected') : t('integrations.notConnected')} · {published ? t('products.channelStatus.published') : t('products.channelStatus.notPublished')}
                          </span>
                          {sync?.sync_status === 'failed' && <span className="mt-1 block text-xs text-red-600">{sync.error_message ?? t('products.channelStatus.syncError')}</span>}
                          {sync?.last_synced_at && <span className="mt-1 block text-xs text-slate-500">{t('products.channelStatus.lastSync')}: {new Date(sync.last_synced_at).toLocaleString()}</span>}
                          {disabled && <span className="mt-1 block text-xs text-slate-500">{connected ? t('products.channelSetupRequired') : t('products.connectIntegration')}</span>}
                        </span>
                      </label>
                    </div>
                  )
                })}
              </div>

              {selectedPublishChannels.length > 0 && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950">{t('products.channelReviewTitle')}</h3>
                    <p className="text-xs text-slate-500">{t('products.channelReviewDescription')}</p>
                  </div>
                  <div className="space-y-2">
                    {selectedPublishChannels.map((channel) => {
                      const config = productChannels.find((item) => item.channel === channel)
                      const issues = validateChannel(channel)
                      const override = channelOverrides[channel] ?? emptyChannelOverride()
                      return (
                        <details key={channel} className="rounded-md border border-slate-200 bg-white p-3" open={issues.length > 0}>
                          <summary className="cursor-pointer text-sm font-medium text-slate-800">
                            {config ? t(config.labelKey) : channel} · {issues.length === 0 ? t('products.channelReady') : t('products.channelNeedsAction')}
                          </summary>
                          {issues.length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                              {issues.map((issue) => <li key={issue}>{issue}</li>)}
                            </ul>
                          )}
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            <input value={override.title} onChange={(event) => updateChannelOverride(channel, { title: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.overrideTitle')} />
                            <input value={override.category} onChange={(event) => updateChannelOverride(channel, { category: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.overrideCategory')} />
                            <input value={override.price} onChange={(event) => updateChannelOverride(channel, { price: event.target.value })} className="rounded-md border px-3 py-2 text-sm" placeholder={t('products.overridePrice')} inputMode="decimal" />
                            <textarea value={override.description} onChange={(event) => updateChannelOverride(channel, { description: event.target.value })} className="min-h-20 rounded-md border px-3 py-2 text-sm md:col-span-2" placeholder={t('products.overrideDescription')} />
                          </div>
                        </details>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void publishChannels(selectedPublishChannels)} disabled={publishingChannels}>
                      <UploadCloud className="h-4 w-4" />
                      {publishingChannels ? t('common.loading') : t('products.publishSelected')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void publishChannels(availablePublishChannels)} disabled={publishingChannels}>
                      {t('products.publishAllAvailable')}
                    </Button>
                  </div>
                </div>
              )}

              {publishResults.length > 0 && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-950">{t('products.publishResults')}</h3>
                  {publishResults.map((result) => {
                    const config = productChannels.find((item) => item.channel === result.channel)
                    return (
                      <div key={result.channel} className="flex flex-col gap-1 rounded-md bg-slate-50 p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">{config ? t(config.labelKey) : result.channel}</span>
                        <span className={result.status === 'published' ? 'text-green-700' : result.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>
                          {result.status === 'published' ? t('products.channelPublished') : result.message}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {selectedPublishChannels.includes('woocommerce') && (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">{t('woocommerce.productType')}</span>
                  <AppSelect value={form.woo_product_type} onChange={(value) => setForm({ ...form, woo_product_type: value as 'simple' | 'variable' })} options={[{ value: 'simple', label: t('woocommerce.simpleProduct') }, { value: 'variable', label: t('woocommerce.variableProduct') }]} />
                </label>
              )}
              {selectedPublishChannels.includes('woocommerce') && form.woo_product_type === 'variable' && (
                <div className="grid gap-4">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('woocommerce.attributesJson')}</span>
                    <textarea value={form.woo_attributes} onChange={(event) => setForm({ ...form, woo_attributes: event.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2 font-mono text-xs" placeholder={t('woocommerce.attributesPlaceholder')} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('woocommerce.variantsJson')}</span>
                    <textarea value={form.woo_variants} onChange={(event) => setForm({ ...form, woo_variants: event.target.value })} className="min-h-28 w-full rounded-md border px-3 py-2 font-mono text-xs" placeholder={t('woocommerce.variantsPlaceholder')} />
                    <span className="text-xs text-slate-500">{t('woocommerce.jsonHelp')}</span>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {editorSection === 'advanced' && (
          <Card>
            <CardHeader><CardTitle>{t('products.editor.advanced')}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>{t('products.advancedNote')}</p>
              <p className="break-all">ID: {product.id}</p>
            </CardContent>
          </Card>
        )}

        <div className="sticky bottom-0 z-30 -mx-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Button type="button" variant="outline" onClick={goBack}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
