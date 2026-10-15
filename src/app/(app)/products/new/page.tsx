'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ProductImageWorkspace } from '@/components/products/product-image-workspace'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useOfflineMode } from '@/contexts/offline-mode-context'
import { useI18n } from '@/contexts/i18n-context'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { deleteOfflineProductDraft, getOfflineProductDraft, saveOfflineProductDraft } from '@/lib/offline-drafts'
import { createClient } from '@/lib/supabase-client'

type Status = 'active' | 'inactive' | 'archived'
type Form = { name: string; sku: string; barcode: string; category: string; description: string; purchase_price: string; selling_price: string; currency: string; low_stock_threshold: string; status: Status; image_url: string; publish_to_woocommerce: boolean; woo_product_type: 'simple' | 'variable'; woo_attributes: string; woo_variants: string }
const emptyForm = (currency: string): Form => ({ name: '', sku: '', barcode: '', category: '', description: '', purchase_price: '', selling_price: '', currency, low_stock_threshold: '0', status: 'active', image_url: '', publish_to_woocommerce: false, woo_product_type: 'simple', woo_attributes: '', woo_variants: '' })

export default function NewProductPage() {
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { userId, isOnline, refreshDrafts, reportStorageUnavailable } = useOfflineMode()
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const [form, setForm] = useState<Form>(emptyForm('EUR'))
  const [loadingDraft, setLoadingDraft] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<'offline' | 'saved' | ''>('')
  const [error, setError] = useState('')
  const [draftAvailable, setDraftAvailable] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [categoryAvailable, setCategoryAvailable] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    if (!currentCompany || !userId) {
      if (!companyLoading && (!userId || !currentCompany)) setLoadingDraft(false)
      return
    }
    let cancelled = false
    void getOfflineProductDraft(userId, currentCompany.id, 'new').then((draft) => {
      if (!cancelled && draft) setDraftAvailable(true)
    }).catch(() => reportStorageUnavailable()).finally(() => { if (!cancelled) setLoadingDraft(false) })
    return () => { cancelled = true }
  }, [companyLoading, currentCompany, reportStorageUnavailable, userId])

  useEffect(() => {
    const copyFrom = searchParams.get('copyFrom')
    if (!copyFrom || !currentCompany || !isOnline) return
    let cancelled = false
    void supabase.from('products').select('*').eq('id', copyFrom).eq('company_id', currentCompany.id).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return
      setForm({
        ...emptyForm(normalizeCurrencyCode(currentCompany.currency ?? 'EUR')),
        name: `${String(data.name ?? '')} ${t('common.copy')}`,
        category: String(data.category ?? ''), description: String(data.description ?? ''),
        purchase_price: data.purchase_price == null ? '' : String(data.purchase_price),
        selling_price: data.selling_price == null ? '' : String(data.selling_price),
        currency: String(data.currency ?? currentCompany.currency ?? 'EUR'),
        low_stock_threshold: String(data.low_stock_threshold ?? 0), status: (data.status ?? 'active') as Status,
        image_url: String(data.image_url ?? ''),
        publish_to_woocommerce: Boolean(data.woo_product_type === 'variable' || data.woo_attributes || data.woo_variants),
        woo_product_type: data.woo_product_type === 'variable' ? 'variable' : 'simple',
        woo_attributes: JSON.stringify(data.woo_attributes ?? [], null, 2),
        woo_variants: JSON.stringify(data.woo_variants ?? [], null, 2),
      })
    })
    return () => { cancelled = true }
  }, [currentCompany, isOnline, searchParams, supabase, t])

  useEffect(() => {
    if (currentCompany && !draftAvailable) setForm(emptyForm(normalizeCurrencyCode(currentCompany.currency ?? 'EUR')))
  }, [currentCompany, draftAvailable])

  useEffect(() => {
    if (!currentCompany || !isOnline) return
    let cancelled = false
    void supabase.from('product_categories').select('id,name').eq('company_id', currentCompany.id).order('name').then(({ data, error }) => {
      if (cancelled) return
      if (!error) { setCategories(data ?? []); setCategoryAvailable(true) }
    })
    return () => { cancelled = true }
  }, [currentCompany, isOnline, supabase])

  const persistLocalDraft = useCallback(async (nextForm: Form) => {
    if (!currentCompany || !userId) return
    try {
      await saveOfflineProductDraft(userId, currentCompany.id, 'new', { form: nextForm })
      await refreshDrafts()
    } catch { reportStorageUnavailable() }
  }, [currentCompany, refreshDrafts, reportStorageUnavailable, userId])

  useEffect(() => {
    if (loadingDraft || notice === 'saved' || !currentCompany || !userId) return
    if (JSON.stringify(form) === JSON.stringify(emptyForm(normalizeCurrencyCode(currentCompany.currency ?? 'EUR')))) return
    const timer = window.setTimeout(() => { void persistLocalDraft(form) }, 400)
    return () => window.clearTimeout(timer)
  }, [currentCompany, form, loadingDraft, notice, persistLocalDraft, userId])

  const update = (patch: Partial<Form>) => { setNotice(''); setError(''); setForm((current) => ({ ...current, ...patch })) }
  const restoreDraft = async () => {
    if (!currentCompany || !userId) return
    const draft = await getOfflineProductDraft(userId, currentCompany.id, 'new')
    const savedForm = draft?.payload.form as Partial<Form> | undefined
    if (savedForm) setForm({ ...emptyForm(normalizeCurrencyCode(currentCompany.currency ?? 'EUR')), ...savedForm })
    setDraftAvailable(false)
  }

  const createCategory = async () => {
    if (!currentCompany || !newCategory.trim() || !isOnline) return
    const name = newCategory.trim()
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'category'
    const { data, error: categoryError } = await supabase.from('product_categories').insert({ company_id: currentCompany.id, name, slug }).select('id,name').single()
    if (categoryError) { setError(categoryError.code === '23505' ? t('products.categoryExists') : categoryError.message); return }
    setCategories((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
    update({ category: data.name })
    setNewCategory('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany || !userId) return
    if (!isOnline) {
      await persistLocalDraft(form)
      setNotice('offline')
      return
    }
    if (!form.name.trim()) { setError(t('products.nameRequired')); return }
    setSaving(true); setError(''); setNotice('')
    let attrs: unknown[] = []; let variants: unknown[] = []
    try {
      attrs = form.woo_attributes.trim() ? JSON.parse(form.woo_attributes) : []
      variants = form.woo_variants.trim() ? JSON.parse(form.woo_variants) : []
      if (!Array.isArray(attrs) || !Array.isArray(variants)) throw new Error('json')
    } catch { setError(t('woocommerce.invalidJson')); setSaving(false); return }
    const payload: Record<string, unknown> = {
      company_id: currentCompany.id, name: form.name.trim(), sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null, category: form.category.trim() || null,
      description: form.description.trim() || null,
      purchase_price: form.purchase_price === '' ? null : Math.max(0, Number(form.purchase_price)),
      selling_price: form.selling_price === '' ? null : Math.max(0, Number(form.selling_price)),
      currency: normalizeCurrencyCode(form.currency), low_stock_threshold: Math.max(0, Number(form.low_stock_threshold) || 0),
      status: form.status, image_url: form.image_url.trim() || null, current_stock: 0,
      woo_product_type: form.publish_to_woocommerce ? form.woo_product_type : 'simple',
      woo_attributes: form.publish_to_woocommerce ? attrs : [], woo_variants: form.publish_to_woocommerce ? variants : [],
    }
    if (categoryAvailable) payload.category_id = categories.find((item) => item.name === form.category.trim())?.id ?? null
    const { error: saveError } = await supabase.from('products').insert(payload)
    setSaving(false)
    if (saveError) { setError(saveError.code === '23505' ? t('products.duplicateCode') : saveError.message); return }
    await deleteOfflineProductDraft(userId, currentCompany.id, 'new').catch(() => undefined)
    await refreshDrafts()
    setNotice('saved')
  }

  if (companyLoading || loadingDraft) return <PageContainer><PageHeader title={t('products.add')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState title={t('common.noWorkspaceSelected')} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><EmptyState title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return <PageContainer className="pb-24">
    <PageHeader title={t('products.add')} description={`${t('products.editorDescription')} · ${currentCompany.name}`}>
      <Link href="/app/products"><Button type="button" variant="outline"><ArrowLeft className="h-4 w-4" />{t('products.backToProducts')}</Button></Link>
    </PageHeader>
    {draftAvailable && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"><span>{t('productUx.offlineDraftAvailable')}</span><Button type="button" variant="outline" onClick={() => void restoreDraft()}>{t('productUx.restoreDraft')}</Button></div>}
    {notice === 'offline' && <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{t('productUx.offlineNotSynced')}</div>}
    {notice === 'saved' && <div role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm">{t('products.created')} · <Link className="underline" href="/app/products">{t('products.backToProducts')}</Link></div>}
    {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm">{error}</div>}
    {!isOnline && <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{t('productUx.offlineNotSynced')}</div>}
    <form onSubmit={submit} className="space-y-5">
      <Card><CardHeader><CardTitle>{t('products.editor.general')}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.name')}</span><input required value={form.name} onChange={(e) => update({ name: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.sku')}</span><input value={form.sku} onChange={(e) => update({ sku: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.barcode')}</span><input value={form.barcode} onChange={(e) => update({ barcode: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <div className="space-y-1"><span className="text-sm font-medium">{t('products.category')}</span>{categoryAvailable ? <AppSelect value={form.category} onChange={(value) => update({ category: value })} options={[{ value: '', label: t('products.noCategory') }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} /> : <input value={form.category} onChange={(e) => update({ category: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" />}{categoryAvailable && <div className="flex min-w-0 gap-2"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" placeholder={t('products.newCategory')} /><Button type="button" variant="outline" onClick={() => void createCategory()} disabled={!newCategory.trim() || !isOnline}>{t('products.createCategory')}</Button></div>}</div>
        <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('products.descriptionField')}</span><textarea value={form.description} onChange={(e) => update({ description: e.target.value })} className="min-h-28 w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t('products.editor.pricing')}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.purchasePrice')}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.purchase_price} onChange={(e) => update({ purchase_price: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.sellingPrice')}</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.selling_price} onChange={(e) => update({ selling_price: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">{t('common.currency')}</span><AppSelect value={form.currency} onChange={(value) => update({ currency: value })} options={currencyOptions.map((item) => ({ value: item.code, label: `${item.code} - ${item.label}` }))} /></label>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t('products.editor.inventory')}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.lowStockThreshold')}</span><input type="number" min="0" step="0.001" inputMode="decimal" value={form.low_stock_threshold} onChange={(e) => update({ low_stock_threshold: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" /></label>
        <label className="space-y-1"><span className="text-sm font-medium">{t('products.status')}</span><AppSelect value={form.status} onChange={(value) => update({ status: value as Status })} options={(['active', 'inactive', 'archived'] as Status[]).map((value) => ({ value, label: t(`products.status.${value}`) }))} /></label>
        {isOnline ? <div className="md:col-span-2"><ProductImageWorkspace companyId={currentCompany.id} productName={form.name} value={form.image_url} onChange={(image_url) => update({ image_url })} t={t} onError={setError} /></div> : <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('woocommerce.imageUrl')}</span><input type="url" value={form.image_url} onChange={(e) => update({ image_url: e.target.value })} className="w-full rounded-md border px-3 py-2 text-base sm:text-sm" placeholder="https://…" /><span className="text-xs text-slate-500">{t('productUx.offlineImageNote')}</span></label>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{t('products.channelsTitle')}</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.publish_to_woocommerce} onChange={(e) => update({ publish_to_woocommerce: e.target.checked })} className="h-4 w-4" />{t('products.publishChannel.woocommerce')}</label>
        {form.publish_to_woocommerce && <><label className="space-y-1"><span className="text-sm font-medium">{t('woocommerce.productType')}</span><AppSelect value={form.woo_product_type} onChange={(value) => update({ woo_product_type: value as Form['woo_product_type'] })} options={[{ value: 'simple', label: t('woocommerce.simpleProduct') }, { value: 'variable', label: t('woocommerce.variableProduct') }]} /></label>{form.woo_product_type === 'variable' && <div className="grid gap-4 md:grid-cols-2"><label className="space-y-1"><span className="text-sm font-medium">{t('woocommerce.attributesJson')}</span><textarea value={form.woo_attributes} onChange={(e) => update({ woo_attributes: e.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2 font-mono text-xs" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('woocommerce.variantsJson')}</span><textarea value={form.woo_variants} onChange={(e) => update({ woo_variants: e.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2 font-mono text-xs" /></label></div>}</>}
      </CardContent></Card>
      <div className="sticky bottom-0 z-20 flex justify-end gap-2 border-t bg-white/95 py-3 backdrop-blur"><Link href="/app/products"><Button type="button" variant="outline">{t('common.cancel')}</Button></Link><Button type="submit" disabled={saving}>{saving ? t('common.loading') : <><Save className="h-4 w-4" />{isOnline ? t('common.save') : t('productUx.saveOfflineDraft')}</>}</Button></div>
    </form>
  </PageContainer>
}
