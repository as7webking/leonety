'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ImageUp, Loader2, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import {
  assessProductImportDraft,
  mergeProductImportDrafts,
  type ExistingProductIdentity,
  type ProductImportDraft,
  type ProductPhotoDraftStatus,
} from '@/lib/product-photo-import'

interface Props {
  companyId: string
  existingProducts: ExistingProductIdentity[]
  onImported: (created: number) => Promise<void> | void
}

interface PhotoItem {
  id: string
  file: File
  status: 'waiting' | 'analyzing' | 'ready' | 'failed'
}

const MAX_PHOTOS = 6
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function replaceTokens(value: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce((result, [token, replacement]) => result.replace(`{${token}}`, String(replacement)), value)
}

function createPhotoId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function statusClass(status: ProductPhotoDraftStatus) {
  if (status === 'new') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'possible_match') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'existing') return 'border-sky-200 bg-sky-50 text-sky-800'
  return 'border-red-200 bg-red-50 text-red-800'
}

export function ProductPhotoImportDialog({ companyId, existingProducts, onImported }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [drafts, setDrafts] = useState<ProductImportDraft[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useBodyScrollLock(open)

  const assessments = useMemo(() => new Map(drafts.map((draft) => [draft.id, assessProductImportDraft(draft, existingProducts, drafts)])), [drafts, existingProducts])
  const selectedDrafts = useMemo(() => drafts.filter((draft) => draft.include), [drafts])
  const selectedHaveErrors = selectedDrafts.some((draft) => {
    const assessment = assessments.get(draft.id)
    return !assessment || assessment.status === 'invalid' || assessment.status === 'conflict' || assessment.status === 'existing' || (assessment.status === 'possible_match' && assessment.needsReview)
  })
  const analyzingCount = photos.filter((photo) => photo.status === 'analyzing').length
  const waitingCount = photos.filter((photo) => photo.status === 'waiting').length

  const updateDraft = (id: string, patch: Partial<ProductImportDraft>, identifierChanged = false) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? {
      ...draft,
      ...patch,
      reviewedAsNew: 'reviewedAsNew' in patch ? Boolean(patch.reviewedAsNew) : false,
      mergeConflicts: identifierChanged ? [] : draft.mergeConflicts,
    } : draft))
  }

  const reset = () => {
    setPhotos([])
    setDrafts([])
    setImporting(false)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const close = () => {
    if (importing || analyzingCount > 0) return
    setOpen(false)
    reset()
  }

  const addPhotos = (files: FileList | null) => {
    if (!files) return
    setError('')
    const remaining = Math.max(0, MAX_PHOTOS - photos.length)
    const accepted = Array.from(files).slice(0, remaining).filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES)
    if (accepted.length !== Math.min(files.length, remaining)) setError(t('productMenu.unsupportedImage'))
    setPhotos((current) => [...current, ...accepted.map((file) => ({ id: createPhotoId(), file, status: 'waiting' as const }))])
    if (inputRef.current) inputRef.current.value = ''
  }

  const analyzePhoto = async (photo: PhotoItem) => {
    setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, status: 'analyzing' } : item))
    try {
      const body = new FormData()
      body.set('companyId', companyId)
      body.set('sourceName', photo.file.name)
      body.set('image', photo.file)
      const response = await fetch('/api/products/photo-import', { method: 'POST', body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.error === 'unsupported_image' || payload.error === 'invalid_image') throw new Error(t('productMenu.unsupportedImage'))
        if (payload.error === 'configuration_missing' || payload.error === 'provider_auth_failed' || payload.error === 'invalid_model' || payload.error === 'vision_unavailable') throw new Error(t('productMenu.providerMissing'))
        throw new Error(t('productPhoto.failure'))
      }
      const incoming = Array.isArray(payload.drafts)
        ? payload.drafts.map((draft: ProductImportDraft, index: number) => ({ ...draft, id: `${photo.id}-${index}`, sourceNames: [photo.file.name] }))
        : []
      setDrafts((current) => mergeProductImportDrafts(current, incoming))
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, status: 'ready' } : item))
    } catch (cause) {
      setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, status: 'failed' } : item))
      setError(cause instanceof Error ? cause.message : t('productPhoto.failure'))
    }
  }

  const analyzeWaitingPhotos = async () => {
    setError('')
    const pending = photos.filter((photo) => photo.status === 'waiting')
    for (const photo of pending) await analyzePhoto(photo)
  }

  const removePhoto = (id: string) => {
    if (analyzingCount > 0) return
    const removed = photos.find((photo) => photo.id === id)
    setPhotos((current) => current.filter((photo) => photo.id !== id))
    if (removed) {
      setDrafts((current) => current
        .map((draft) => ({ ...draft, sourceNames: draft.sourceNames.filter((name) => name !== removed.file.name) }))
        .filter((draft) => draft.sourceNames.length > 0))
    }
  }

  const confirmImport = async () => {
    if (selectedDrafts.length === 0 || selectedHaveErrors) return
    setImporting(true)
    setError('')
    try {
      const response = await fetch('/api/products/photo-import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          products: selectedDrafts.map(({ sku, barcode, name, description, price, category }) => ({ sku, barcode, name, description, price, category })),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.error === 'duplicate_sku' || payload.error === 'duplicate_barcode' || payload.error === 'existing_product') throw new Error(t('productPhoto.duplicateIdentifier'))
        throw new Error(t('productMenu.importFailed'))
      }
      await onImported(Number(payload.created) || selectedDrafts.length)
      setOpen(false)
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('productMenu.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left lg:w-auto" onClick={() => setOpen(true)}>
        <ImageUp className="h-4 w-4 shrink-0" />{t('productMenu.photoImport')}
      </Button>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="photo-import-title" className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id="photo-import-title" className="break-words text-xl font-semibold">{t('productPhoto.title')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('productPhoto.description')}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={close} aria-label={t('productPhoto.close')}><X className="h-5 w-5" /></Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="min-w-0 space-y-1">
                    <span className="block text-sm font-medium">{t('productPhoto.choose')}</span>
                    <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => addPhotos(event.target.files)} disabled={photos.length >= MAX_PHOTOS || importing || analyzingCount > 0} className="block w-full max-w-full text-sm" />
                    <span className="block text-xs text-slate-500">{t('productPhoto.supported')}</span>
                  </label>
                  <Button type="button" disabled={waitingCount === 0 || importing || analyzingCount > 0} onClick={() => void analyzeWaitingPhotos()}>
                    {analyzingCount > 0 && <Loader2 className="h-4 w-4 animate-spin" />}
                    {analyzingCount > 0 ? replaceTokens(t('productPhoto.analyzing'), { current: photos.filter((photo) => photo.status === 'ready').length + 1, total: photos.length }) : t('productPhoto.analyze')}
                  </Button>
                </div>
                {photos.length > 0 && <ul className="mt-4 grid gap-2 sm:grid-cols-2">{photos.map((photo) => (
                  <li key={photo.id} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                    {photo.status === 'analyzing' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" /> : photo.status === 'ready' ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : photo.status === 'failed' ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> : <ImageUp className="h-4 w-4 shrink-0 text-slate-500" />}
                    <span className="min-w-0 flex-1 truncate" title={photo.file.name}>{photo.file.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{photo.status === 'analyzing' ? t('productMenu.analyzing') : t(`productPhoto.${photo.status === 'ready' ? 'photoReady' : photo.status === 'failed' ? 'photoFailed' : 'waiting'}`)}</span>
                    {photo.status === 'failed' && <Button type="button" variant="ghost" size="sm" onClick={() => void analyzePhoto(photo)} disabled={analyzingCount > 0 || importing} aria-label={`${t('productPhoto.retry')} ${photo.file.name}`}><RotateCcw className="h-4 w-4" /></Button>}
                    {photo.status !== 'analyzing' && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePhoto(photo.id)} disabled={analyzingCount > 0 || importing} aria-label={`${t('common.delete')} ${photo.file.name}`}><X className="h-4 w-4" /></Button>}
                  </li>
                ))}</ul>}
              </section>

              {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

              {drafts.length > 0 && (
                <section className="mt-5 space-y-3" aria-labelledby="photo-review-title">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div><h3 id="photo-review-title" className="font-semibold">{t('productMenu.reviewTitle')}</h3><p className="text-sm text-slate-500">{t('productMenu.reviewDescription')}</p></div>
                    <span className="text-sm text-slate-500">{replaceTokens(t('productPhoto.selected'), { count: selectedDrafts.length })}</span>
                  </div>
                  <div className="grid min-w-0 gap-3">{drafts.map((draft) => {
                    const assessment = assessments.get(draft.id)!
                    const statusLabel = t(`productPhoto.${assessment.status === 'possible_match' ? 'possibleMatch' : assessment.status}`)
                    const validationMessage = assessment.reason === 'name_required' ? t('productPhoto.nameRequired') : assessment.reason === 'price_invalid' ? t('productPhoto.priceInvalid') : ''
                    return (
                      <article key={draft.id} className={`min-w-0 rounded-md border p-3 sm:p-4 ${draft.include ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                          <label className="flex min-w-0 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.include} onChange={(event) => updateDraft(draft.id, { include: event.target.checked })} /><span className="break-words">{draft.name || t('productPhoto.name')}</span></label>
                          <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(assessment.status)}`}>{statusLabel}</span>
                          <span className="text-xs text-slate-500">{assessment.needsReview ? t('productPhoto.needsReview') : t('productPhoto.ready')}</span>
                          <Button type="button" variant="ghost" size="sm" className="ml-auto text-red-700" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))} disabled={importing} aria-label={`${t('productPhoto.removeDraft')} ${draft.name}`}><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">{t('productPhoto.removeDraft')}</span></Button>
                        </div>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">{t('productPhoto.name')}</span><input value={draft.name} onChange={(event) => updateDraft(draft.id, { name: event.target.value })} className="h-10 w-full min-w-0 rounded-md border px-3" /></label>
                          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">{t('productPhoto.sku')}</span><input value={draft.sku} onChange={(event) => updateDraft(draft.id, { sku: event.target.value }, true)} className="h-10 w-full min-w-0 rounded-md border px-3" /></label>
                          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">{t('productPhoto.barcode')}</span><input value={draft.barcode} onChange={(event) => updateDraft(draft.id, { barcode: event.target.value }, true)} className="h-10 w-full min-w-0 rounded-md border px-3" /></label>
                          <label className="min-w-0 text-sm"><span className="mb-1 block font-medium">{t('productPhoto.price')}</span><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => updateDraft(draft.id, { price: event.target.value })} className="h-10 w-full min-w-0 rounded-md border px-3" /></label>
                          <label className="min-w-0 text-sm sm:col-span-1 lg:col-span-2"><span className="mb-1 block font-medium">{t('productPhoto.category')}</span><input value={draft.category} onChange={(event) => updateDraft(draft.id, { category: event.target.value })} className="h-10 w-full min-w-0 rounded-md border px-3" /></label>
                          <label className="min-w-0 text-sm sm:col-span-2 lg:col-span-3"><span className="mb-1 block font-medium">{t('productPhoto.descriptionField')}</span><textarea value={draft.description} onChange={(event) => updateDraft(draft.id, { description: event.target.value })} className="min-h-20 w-full min-w-0 rounded-md border px-3 py-2" /></label>
                        </div>
                        <div className="mt-3 space-y-2 text-xs">
                          <p className="break-words text-slate-500"><span className="font-medium">{t('productPhoto.sources')}:</span> {draft.sourceNames.join(', ')}</p>
                          {validationMessage && <p className="text-red-700">{validationMessage}</p>}
                          {assessment.status === 'new' && assessment.needsReview && <p className="text-amber-800">{t('productPhoto.missingOptional')}</p>}
                          {assessment.status === 'possible_match' && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900"><p>{replaceTokens(t('productPhoto.matchedWith'), { name: assessment.matchedProductName || '' })}</p><label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={draft.reviewedAsNew} onChange={(event) => updateDraft(draft.id, { reviewedAsNew: event.target.checked })} /><span>{t('productPhoto.reviewAsNew')}</span></label></div>}
                          {assessment.status === 'existing' && <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-800">{t('productPhoto.existingBlocked')}</p>}
                          {assessment.status === 'conflict' && <p className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">{t('productPhoto.conflictBlocked')}</p>}
                        </div>
                      </article>
                    )
                  })}</div>
                </section>
              )}

              {photos.some((photo) => photo.status === 'ready') && drafts.length === 0 && analyzingCount === 0 && <p className="mt-5 text-sm text-slate-500">{t('productPhoto.noResults')}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white p-4 sm:p-5">
              <span className="text-sm text-slate-500">{replaceTokens(t('productPhoto.selected'), { count: selectedDrafts.length })}</span>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={close} disabled={importing || analyzingCount > 0}>{t('common.cancel')}</Button>
                <Button type="button" onClick={() => void confirmImport()} disabled={selectedDrafts.length === 0 || selectedHaveErrors || importing || analyzingCount > 0}>
                  {importing && <Loader2 className="h-4 w-4 animate-spin" />}{importing ? t('productPhoto.importing') : t('productPhoto.import')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
