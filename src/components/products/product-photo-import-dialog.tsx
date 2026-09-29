'use client'

import { useMemo, useRef, useState } from 'react'
import { ImageUp, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { findSkuDuplicate, validateProductImportDraft, type ExistingProductIdentity, type ProductImportDraft } from '@/lib/product-photo-import'

interface Props {
  companyId: string
  existingProducts: ExistingProductIdentity[]
  onImported: (created: number) => Promise<void> | void
}

function replaceToken(value: string, token: string, replacement: string) {
  return value.replace(`{${token}}`, replacement)
}

export function ProductPhotoImportDialog({ companyId, existingProducts, onImported }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [drafts, setDrafts] = useState<ProductImportDraft[]>([])
  const [busy, setBusy] = useState<'analyze' | 'import' | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useBodyScrollLock(open)

  const selectedDrafts = useMemo(() => drafts.filter((draft) => draft.include), [drafts])
  const selectedHaveErrors = selectedDrafts.some((draft) => validateProductImportDraft(draft) || findSkuDuplicate(draft.position, existingProducts, drafts, draft.id))

  const updateDraft = (id: string, patch: Partial<ProductImportDraft>) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft))
  }

  const reset = () => {
    setFile(null)
    setDrafts([])
    setBusy(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    reset()
  }

  const analyze = async () => {
    if (!file) return
    setBusy('analyze')
    setError('')
    try {
      const body = new FormData()
      body.set('companyId', companyId)
      body.set('image', file)
      const response = await fetch('/api/products/photo-import', { method: 'POST', body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.error === 'unsupported_image' || payload.error === 'invalid_image') throw new Error(t('productMenu.unsupportedImage'))
        if (payload.error === 'configuration_missing' || payload.error === 'provider_auth_failed' || payload.error === 'invalid_model' || payload.error === 'vision_unavailable') throw new Error(t('productMenu.providerMissing'))
        throw new Error(t('productMenu.extractionFailed'))
      }
      setDrafts(Array.isArray(payload.drafts) ? payload.drafts : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('productMenu.extractionFailed'))
    } finally {
      setBusy(null)
    }
  }

  const confirmImport = async () => {
    if (selectedDrafts.length === 0 || selectedHaveErrors) return
    setBusy('import')
    setError('')
    try {
      const response = await fetch('/api/products/photo-import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          products: selectedDrafts.map(({ position, name, description, price, category }) => ({ position, name, description, price, category })),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.error === 'duplicate_sku') throw new Error(t('productMenu.resolveDuplicate'))
        throw new Error(t('productMenu.importFailed'))
      }
      await onImported(Number(payload.created) || selectedDrafts.length)
      setOpen(false)
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('productMenu.importFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left lg:w-auto" onClick={() => setOpen(true)}><ImageUp className="h-4 w-4 shrink-0" />{t('productMenu.photoImport')}</Button>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="photo-import-title" className="flex max-h-[96dvh] w-full max-w-7xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
              <div className="min-w-0"><h2 id="photo-import-title" className="text-xl font-semibold">{t('productMenu.photoImport')}</h2><p className="mt-1 text-sm text-slate-500">{t('productMenu.photoImportDescription')}</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={close} aria-label={t('productMenu.close')}><X className="h-5 w-5" /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="min-w-0 space-y-1"><span className="block text-sm font-medium">{t('productMenu.choosePhoto')}</span><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setDrafts([]); setError('') }} className="block w-full max-w-full text-sm" /><span className="block text-xs text-slate-500">{t('productMenu.supportedPhoto')}</span></label>
                <Button type="button" disabled={!file || busy !== null} onClick={() => void analyze()}>{busy === 'analyze' && <Loader2 className="h-4 w-4 animate-spin" />}{busy === 'analyze' ? t('productMenu.analyzing') : t('productMenu.analyzePhoto')}</Button>
              </div>
              {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              {drafts.length > 0 && (
                <section className="mt-5 space-y-3" aria-labelledby="photo-review-title">
                  <div><h3 id="photo-review-title" className="font-semibold">{t('productMenu.reviewTitle')}</h3><p className="text-sm text-slate-500">{t('productMenu.reviewDescription')}</p></div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-[1050px] w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">{t('productMenu.include')}</th><th className="p-3">{t('productMenu.position')}</th><th className="p-3">{t('productMenu.draftName')}</th><th className="p-3">{t('productMenu.draftDescription')}</th><th className="p-3">{t('productMenu.draftPrice')}</th><th className="p-3">{t('productMenu.draftCategory')}</th><th className="p-3">{t('productMenu.validation')}</th></tr></thead>
                      <tbody className="divide-y divide-slate-200">{drafts.map((draft) => {
                        const validation = validateProductImportDraft(draft)
                        const duplicate = findSkuDuplicate(draft.position, existingProducts, drafts, draft.id)
                        const validationText = validation === 'name_required' ? t('productMenu.nameRequired') : validation === 'price_invalid' ? t('productMenu.invalidPrice') : duplicate ? replaceToken(t(duplicate.kind === 'existing' ? 'productMenu.duplicateSkuExisting' : 'productMenu.duplicateSkuDraft'), 'name', duplicate.label) : ''
                        return <tr key={draft.id} className={!draft.include ? 'bg-slate-50 text-slate-500' : ''}><td className="p-3 align-top"><input type="checkbox" checked={draft.include} onChange={(event) => updateDraft(draft.id, { include: event.target.checked })} aria-label={`${t('productMenu.include')} ${draft.name || draft.position}`} /></td><td className="p-2 align-top"><input value={draft.position} onChange={(event) => updateDraft(draft.id, { position: event.target.value })} className="w-32 rounded border px-2 py-2" /></td><td className="p-2 align-top"><input value={draft.name} onChange={(event) => updateDraft(draft.id, { name: event.target.value })} className="w-52 rounded border px-2 py-2" /></td><td className="p-2 align-top"><textarea value={draft.description} onChange={(event) => updateDraft(draft.id, { description: event.target.value })} className="min-h-10 w-64 rounded border px-2 py-2" /></td><td className="p-2 align-top"><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => updateDraft(draft.id, { price: event.target.value })} className="w-28 rounded border px-2 py-2" /></td><td className="p-2 align-top"><input value={draft.category} onChange={(event) => updateDraft(draft.id, { category: event.target.value })} className="w-44 rounded border px-2 py-2" /></td><td className="max-w-64 p-3 align-top text-xs text-red-700">{draft.include && validationText ? <>{validationText} {duplicate && t('productMenu.resolveDuplicate')}</> : '—'}</td></tr>
                      })}</tbody>
                    </table>
                  </div>
                </section>
              )}
              {file && !busy && drafts.length === 0 && !error && <p className="mt-5 text-sm text-slate-500">{t('productMenu.noDrafts')}</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white p-4 sm:p-5"><span className="text-sm text-slate-500">{replaceToken(t('productMenu.selectedDraftCount'), 'count', String(selectedDrafts.length))}</span><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={close} disabled={busy !== null}>{t('common.cancel')}</Button><Button type="button" onClick={() => void confirmImport()} disabled={selectedDrafts.length === 0 || selectedHaveErrors || busy !== null}>{busy === 'import' && <Loader2 className="h-4 w-4 animate-spin" />}{busy === 'import' ? t('productMenu.importing') : t('productMenu.confirmImport')}</Button></div></div>
          </div>
        </div>
      )}
    </>
  )
}
