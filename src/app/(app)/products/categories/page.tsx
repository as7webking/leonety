'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

interface ProductCategory {
  id: string
  company_id: string
  name: string
  slug: string | null
  description: string | null
  woo_category_id: string | null
}

interface WooCategory {
  id: number
  name: string
}

type SortMode = 'name' | 'count'

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function categorySlug(value: string) {
  return value.toLocaleLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'category'
}

export default function ProductCategoriesPage() {
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [deletingCategory, setDeletingCategory] = useState<ProductCategory | null>(null)
  const [reassignTo, setReassignTo] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [wooConnected, setWooConnected] = useState(false)
  const [wooCategories, setWooCategories] = useState<WooCategory[]>([])
  const [wooError, setWooError] = useState('')
  const [wooLoading, setWooLoading] = useState(false)
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null)
  const [creatingWooCategoryId, setCreatingWooCategoryId] = useState<string | null>(null)
  const loadVersion = useRef(0)

  const load = useCallback(async () => {
    const requestVersion = ++loadVersion.current
    if (!currentCompany) {
      if (!companyLoading) setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const [categoryResult, productResult, connectionResult] = await Promise.all([
      supabase.from('product_categories').select('id,company_id,name,slug,description,woo_category_id').eq('company_id', currentCompany.id).order('name'),
      supabase.from('products').select('category_id').eq('company_id', currentCompany.id),
      fetch(`/api/woocommerce/connection?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' }).then(async (response) => ({ response, payload: await response.json().catch(() => ({})) })).catch(() => null),
    ])
    if (requestVersion !== loadVersion.current) return

    if (categoryResult.error || productResult.error) {
      setError(t('productCategories.loadFailed'))
      setLoading(false)
      return
    }

    const nextCategories = (categoryResult.data ?? []) as ProductCategory[]
    const counts: Record<string, number> = {}
    for (const product of productResult.data ?? []) {
      if (product.category_id) counts[product.category_id] = (counts[product.category_id] ?? 0) + 1
    }
    setCategories(nextCategories)
    setProductCounts(counts)

    const connected = Boolean(connectionResult?.response.ok && connectionResult.payload.connected)
    setWooConnected(connected)
    setWooCategories([])
    setWooError(connectionResult?.response.ok ? '' : t('productCategories.wooLoadFailed'))
    if (connected) {
      setWooLoading(true)
      try {
        const response = await fetch(`/api/woocommerce/categories?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error ?? t('productCategories.wooLoadFailed'))
        if (requestVersion !== loadVersion.current) return
        setWooCategories(Array.isArray(payload.categories) ? payload.categories : [])
      } catch {
        if (requestVersion === loadVersion.current) setWooError(t('productCategories.wooLoadFailed'))
      } finally {
        if (requestVersion === loadVersion.current) setWooLoading(false)
      }
    }
    setLoading(false)
  }, [companyLoading, currentCompany, supabase, t])

  useEffect(() => { void load() }, [load])

  const visibleCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return categories
      .filter((category) => !normalizedSearch || category.name.toLocaleLowerCase().includes(normalizedSearch))
      .sort((left, right) => sort === 'name'
        ? left.name.localeCompare(right.name)
        : (productCounts[right.id] ?? 0) - (productCounts[left.id] ?? 0) || left.name.localeCompare(right.name))
  }, [categories, productCounts, search, sort])

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany || creating) return
    const name = normalizeCategoryName(newName)
    if (!name) return
    setCreating(true)
    setError('')
    setNotice('')
    const { error: createError } = await supabase.from('product_categories').insert({ company_id: currentCompany.id, name, slug: categorySlug(name), description: newDescription.trim() || null })
    setCreating(false)
    if (createError) {
      setError(createError.code === '23505' ? t('productCategories.duplicate') : t('productCategories.saveFailed'))
      return
    }
    setNewName('')
    setNewDescription('')
    setNotice(t('productCategories.created'))
    await load()
  }

  const saveRename = async (category: ProductCategory) => {
    if (!currentCompany) return
    const name = normalizeCategoryName(editingName)
    if (!name || name === category.name) { setEditingId(null); return }
    setError('')
    setNotice('')
    const { error: renameError } = await supabase.from('product_categories').update({ name, slug: categorySlug(name), description: editingDescription.trim() || null, updated_at: new Date().toISOString() }).eq('id', category.id).eq('company_id', currentCompany.id)
    if (renameError) {
      setError(renameError.code === '23505' ? t('productCategories.duplicate') : t('productCategories.saveFailed'))
      return
    }
    const { error: productUpdateError } = await supabase.from('products').update({ category: name, updated_at: new Date().toISOString() }).eq('category_id', category.id).eq('company_id', currentCompany.id)
    if (productUpdateError) {
      setError(t('productCategories.saveFailed'))
      await load()
      return
    }
    setEditingId(null)
    setNotice(t('productCategories.updated'))
    await load()
  }

  const deleteCategory = async () => {
    if (!currentCompany || !deletingCategory || deleting) return
    setDeleting(true)
    setError('')
    setNotice('')
    const count = productCounts[deletingCategory.id] ?? 0
    let affectedCount = 0
    if (count > 0) {
      const target = categories.find((category) => category.id === reassignTo)
      const query = supabase.from('products').update({ category_id: target?.id ?? null, category: target?.name ?? null, updated_at: new Date().toISOString() })
        .eq('company_id', currentCompany.id).eq('category_id', deletingCategory.id)
      const { data, error: reassignmentError } = await query.select('id')
      if (reassignmentError) {
        setDeleting(false)
        setError(t('productCategories.deleteFailed'))
        return
      }
      affectedCount = data?.length ?? 0
    }

    const { data: deleted, error: deleteError } = await supabase.from('product_categories').delete().eq('id', deletingCategory.id).eq('company_id', currentCompany.id).select('id')
    setDeleting(false)
    if (deleteError || !deleted?.length) {
      setError(t('productCategories.deleteFailed'))
      await load()
      return
    }
    setDeletingCategory(null)
    setReassignTo('')
    setNotice(t('productCategories.deleted').replace('{count}', String(affectedCount)))
    await load()
  }

  const saveWooMapping = async (category: ProductCategory, value: string) => {
    if (!currentCompany) return false
    setSavingMappingId(category.id)
    setError('')
    setNotice('')
    const { error: mappingError } = await supabase.from('product_categories').update({ woo_category_id: value || null, updated_at: new Date().toISOString() }).eq('id', category.id).eq('company_id', currentCompany.id)
    setSavingMappingId(null)
    if (mappingError) {
      setError(t('productCategories.wooSaveFailed'))
      return false
    }
    setNotice(t('productCategories.wooSaved'))
    await load()
    return true
  }

  const createAndMapWooCategory = async (category: ProductCategory) => {
    if (!currentCompany || creatingWooCategoryId) return
    setCreatingWooCategoryId(category.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/woocommerce/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, name: category.name }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.category?.id) throw new Error(payload.error ?? t('productCategories.wooCreateFailed'))
      const mappingSaved = await saveWooMapping(category, String(payload.category.id))
      if (!mappingSaved) return
      if (payload.created) setNotice(t('productCategories.wooCreatedAndMapped'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('productCategories.wooCreateFailed'))
    } finally {
      setCreatingWooCategoryId(null)
    }
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('productCategories.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} /></PageContainer>
  if (error && categories.length === 0) return <PageContainer><PageHeader title={t('productCategories.title')} /><EmptyState icon={Package} title={t('common.error')} description={error} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('productCategories.title')} description={`${t('productCategories.description')} · ${currentCompany.name}`}>
        <Button asChild variant="outline" className="w-full sm:w-auto"><Link href="/app/products">{t('products.title')}</Link></Button>
      </PageHeader>

      {error && <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <Card className="mb-4"><CardContent className="p-4">
        <form onSubmit={createCategory} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor="new-product-category">{t('productCategories.name')}</label>
          <input id="new-product-category" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} className="h-11 min-w-0 rounded-md border px-3 text-base sm:text-sm" placeholder={t('productCategories.name')} />
          <label className="sr-only" htmlFor="new-product-category-description">{t('productCategories.descriptionField')}</label>
          <input id="new-product-category-description" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={500} className="h-11 min-w-0 rounded-md border px-3 text-base sm:text-sm" placeholder={t('productCategories.descriptionField')} />
          <Button type="submit" disabled={creating || !normalizeCategoryName(newName)} className="w-full sm:w-auto"><Plus className="h-4 w-4" />{t('productCategories.create')}</Button>
        </form>
      </CardContent></Card>

      <div className="mb-4 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full min-w-0 rounded-md border pl-9 pr-3 text-base sm:text-sm" placeholder={t('productCategories.search')} aria-label={t('productCategories.search')} /></div>
        <AppSelect value={sort} onChange={(value) => setSort(value as SortMode)} ariaLabel={t('common.sortBy')} options={[{ value: 'name', label: t('productCategories.sortName') }, { value: 'count', label: t('productCategories.sortCount') }]} />
      </div>

      {wooConnected && <p className="mb-3 text-sm text-slate-600">WooCommerce · {wooError || (wooLoading ? t('common.loading') : `${wooCategories.length} ${t('productCategories.wooMapping').toLocaleLowerCase()}`)}</p>}
      {!wooConnected && !wooError && <p className="mb-3 text-sm text-slate-500">{t('productCategories.wooNotConnected')}</p>}
      {wooError && <p role="alert" className="mb-3 text-sm text-amber-800">{wooError}</p>}

      {visibleCategories.length === 0 ? (
        <EmptyState icon={Package} title={search ? t('productCategories.emptySearch') : t('productCategories.empty')} />
      ) : (
        <div className="grid min-w-0 gap-3">
          {visibleCategories.map((category) => {
            const count = productCounts[category.id] ?? 0
            const mappedWoo = wooCategories.find((item) => String(item.id) === category.woo_category_id)
            return <Card key={category.id}><CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_auto] lg:items-center">
              <div className="min-w-0">
                {editingId === category.id ? <div className="flex min-w-0 flex-col gap-2"><input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={120} aria-label={t('productCategories.name')} className="h-10 min-w-0 rounded-md border px-3 text-base sm:text-sm" /><input value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} maxLength={500} aria-label={t('productCategories.descriptionField')} className="h-10 min-w-0 rounded-md border px-3 text-base sm:text-sm" placeholder={t('productCategories.descriptionField')} /><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => void saveRename(category)} disabled={!normalizeCategoryName(editingName)}>{t('productCategories.save')}</Button><Button type="button" variant="ghost" onClick={() => setEditingId(null)} aria-label={t('productCategories.cancel')}><X className="h-4 w-4" /></Button></div></div> : <>
                  <Link href={`/app/products?category=${encodeURIComponent(category.name)}`} className="block break-words font-semibold text-slate-900 hover:underline">{category.name}</Link>
                  {category.description && <p className="mt-1 break-words text-sm text-slate-600">{category.description}</p>}
                  <p className="mt-1 text-sm text-slate-500">{count} {t('productCategories.products')}</p>
                </>}
              </div>

              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-600">{t('productCategories.wooMapping')}</label>
                {wooConnected && !wooError ? <AppSelect value={category.woo_category_id ?? ''} onChange={(value) => void saveWooMapping(category, value)} disabled={wooLoading || savingMappingId === category.id} ariaLabel={`${t('productCategories.wooMapping')} ${category.name}`} options={[{ value: '', label: t('productCategories.wooUnmapped') }, ...(category.woo_category_id && !mappedWoo ? [{ value: category.woo_category_id, label: t('productCategories.wooMissing').replace('{id}', category.woo_category_id) }] : []), ...wooCategories.map((item) => ({ value: String(item.id), label: `${item.name} (#${item.id})` }))]} /> : <p className="break-words text-sm text-slate-500">{mappedWoo?.name ?? (category.woo_category_id ? `ID ${category.woo_category_id}` : t('productCategories.wooUnmapped'))}</p>}
              </div>

              <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
                {wooConnected && !wooError && (!category.woo_category_id || !mappedWoo) && <Button type="button" variant="outline" onClick={() => void createAndMapWooCategory(category)} disabled={creatingWooCategoryId === category.id || wooLoading}><Plus className="h-4 w-4" />{creatingWooCategoryId === category.id ? t('common.loading') : t('productCategories.wooCreateAndMap')}</Button>}
                {editingId !== category.id && <Button type="button" variant="outline" onClick={() => { setEditingId(category.id); setEditingName(category.name); setEditingDescription(category.description ?? '') }}><Pencil className="h-4 w-4" />{t('productCategories.edit')}</Button>}
                <Button type="button" variant="ghost" onClick={() => { setDeletingCategory(category); setReassignTo('') }}><Trash2 className="h-4 w-4" />{t('productCategories.delete')}</Button>
              </div>

              {deletingCategory?.id === category.id && <div className="col-span-full min-w-0 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-950">{t('productCategories.deleteImpact').replace('{count}', String(count))}</p>
                {count > 0 && <div className="mt-3 max-w-xl"><label className="mb-1 block text-sm font-medium">{t('productCategories.reassignTo')}</label><AppSelect value={reassignTo} onChange={setReassignTo} ariaLabel={t('productCategories.reassignTo')} options={[{ value: '', label: t('productCategories.noCategory') }, ...categories.filter((item) => item.id !== category.id).map((item) => ({ value: item.id, label: item.name }))]} /></div>}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Button type="button" variant="destructive" onClick={() => void deleteCategory()} disabled={deleting}>{deleting ? t('common.loading') : t('productCategories.confirmDelete')}</Button><Button type="button" variant="outline" onClick={() => setDeletingCategory(null)} disabled={deleting}>{t('productCategories.cancel')}</Button></div>
              </div>}
            </CardContent></Card>
          })}
        </div>
      )}
    </PageContainer>
  )
}
