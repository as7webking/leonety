'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Link2, Loader2, RefreshCw, Unlink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { useI18n } from '@/contexts/i18n-context'
import {
  comparableProductFields,
  type ComparableProductField,
  type ExternalChannelProduct,
  type ProductChannelComparisonRow,
  type ProductChannelStatus,
  type ProductFieldOwner,
  type SupportedComparisonProvider,
} from '@/lib/product-channel-comparison'

interface Props {
  companyId: string
  connectedProviders: SupportedComparisonProvider[]
  onChanged: () => Promise<void> | void
}

interface ComparisonResponse {
  rows: ProductChannelComparisonRow[]
  externalProducts: ExternalChannelProduct[]
  preferencesAvailable: boolean
}

const linkedStatuses: ProductChannelStatus[] = ['linked', 'different', 'sync_error']

function interpolate(value: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce((result, [token, replacement]) => result.replace(`{${token}}`, String(replacement)), value)
}

function statusClass(status: ProductChannelStatus) {
  if (status === 'linked') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'different' || status === 'not_linked') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (status === 'only_leonety' || status === 'only_provider') return 'border-sky-200 bg-sky-50 text-sky-800'
  return 'border-red-200 bg-red-50 text-red-800'
}

export function ProductChannelComparisonDialog({ companyId, connectedProviders, onChanged }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<SupportedComparisonProvider>(connectedProviders[0] ?? 'woocommerce')
  const [rows, setRows] = useState<ProductChannelComparisonRow[]>([])
  const [externalProducts, setExternalProducts] = useState<ExternalChannelProduct[]>([])
  const [preferencesAvailable, setPreferencesAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [candidateSelections, setCandidateSelections] = useState<Record<string, string>>({})
  const [pullRows, setPullRows] = useState<ProductChannelComparisonRow[]>([])
  const [pullFields, setPullFields] = useState<Set<ComparableProductField>>(new Set())
  const [pullAvailableFields, setPullAvailableFields] = useState<ComparableProductField[]>([])
  const [ownershipDrafts, setOwnershipDrafts] = useState<Record<string, Partial<Record<ComparableProductField, ProductFieldOwner>>>>({})
  useBodyScrollLock(open)

  useEffect(() => {
    if (!connectedProviders.includes(provider) && connectedProviders[0]) setProvider(connectedProviders[0])
  }, [connectedProviders, provider])

  const load = useCallback(async () => {
    if (!open || !connectedProviders.includes(provider)) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/products/channel-comparison?companyId=${encodeURIComponent(companyId)}&provider=${encodeURIComponent(provider)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error('provider_unavailable')
      const data = payload as ComparisonResponse
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setExternalProducts(Array.isArray(data.externalProducts) ? data.externalProducts : [])
      setPreferencesAvailable(data.preferencesAvailable !== false)
      setSelected(new Set())
      setOwnershipDrafts({})
    } catch {
      setError(t('productChannel.providerUnavailable'))
    } finally {
      setLoading(false)
    }
  }, [companyId, connectedProviders, open, provider, t])

  useEffect(() => { void load() }, [load])

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected])
  const externalById = useMemo(() => new Map(externalProducts.map((product) => [product.id, product])), [externalProducts])

  const close = () => {
    if (busy) return
    setOpen(false)
    setRows([])
    setSelected(new Set())
    setError('')
    setMessage('')
  }

  const postAction = async (
    action: 'link' | 'unlink' | 'import' | 'pull' | 'set_ownership',
    items: Array<{ productId?: string; externalProductId?: string; fields?: ComparableProductField[] }>,
    ownership?: Partial<Record<ComparableProductField, ProductFieldOwner>>,
  ) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/products/channel-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, provider, action, items, ownership }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok && !payload.completed) throw new Error('action_failed')
      setMessage(`${interpolate(t('productChannel.completed'), { count: Number(payload.completed ?? 0) })}${payload.failed ? ` · ${interpolate(t('productChannel.failed'), { count: Number(payload.failed) })}` : ''}`)
      await onChanged()
      await load()
    } catch {
      setError(t('productChannel.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const pushRows = async (targetRows: ProductChannelComparisonRow[], confirmBulk: boolean) => {
    const productIds = [...new Set(targetRows.flatMap((row) => row.local ? [row.local.id] : []))]
    if (productIds.length === 0) return
    if (confirmBulk && !window.confirm(interpolate(t('productChannel.confirmAction'), { count: productIds.length }))) return
    setBusy(true)
    setError('')
    setMessage('')
    let completed = 0
    try {
      if (provider === 'shopify') {
        const response = await fetch('/api/store-integrations/products/sync', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ companyId, provider, productIds }) })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error('push_failed')
        completed = Number(payload.synced ?? 0)
      } else {
        for (const productId of productIds) {
          const response = await fetch('/api/woocommerce/products/sync', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ companyId, productId }) })
          if (!response.ok) throw new Error('push_failed')
          completed += 1
        }
      }
      setMessage(interpolate(t('productChannel.completed'), { count: completed }))
      await onChanged()
      await load()
    } catch {
      setError(t('productChannel.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const startPull = (targetRows: ProductChannelComparisonRow[]) => {
    const eligible = targetRows.filter((row) => row.local && row.external && linkedStatuses.includes(row.status))
    if (eligible.length === 0) {
      setError(t('productChannel.linkRequired'))
      return
    }
    setPullRows(eligible)
    const availableFields = comparableProductFields.filter((field) => eligible.every((row) => row.external?.supportedFields.includes(field)))
    const differentFields = new Set<ComparableProductField>()
    for (const row of eligible) for (const field of row.differences) if (availableFields.includes(field)) differentFields.add(field)
    const suggestedFields = availableFields.filter((field) => ['name', 'price', 'stock'].includes(field))
    setPullAvailableFields(availableFields)
    setPullFields(differentFields.size > 0 ? differentFields : new Set(suggestedFields))
  }

  const confirmPull = async () => {
    const fields = [...pullFields]
    if (fields.length === 0 || pullRows.length === 0) return
    if (pullRows.length > 1 && !window.confirm(interpolate(t('productChannel.confirmAction'), { count: pullRows.length }))) return
    await postAction('pull', pullRows.map((row) => ({ productId: row.local!.id, externalProductId: row.external!.id, fields })))
    setPullRows([])
    setPullAvailableFields([])
  }

  const linkRow = async (row: ProductChannelComparisonRow) => {
    if (!row.local) return
    const externalId = row.external?.id ?? candidateSelections[row.id]
    if (!externalId) return
    if (row.matchReason === 'name_suggestion' && !window.confirm(t('productChannel.explicitSuggestion'))) return
    await postAction('link', [{ productId: row.local.id, externalProductId: externalId }])
  }

  const unlinkRows = async (targetRows: ProductChannelComparisonRow[]) => {
    const eligible = targetRows.filter((row) => row.local && (linkedStatuses.includes(row.status) || (row.status === 'conflict' && row.matchReason === 'mapping')))
    if (eligible.length === 0) return
    if (!window.confirm(interpolate(t('productChannel.removeLinkConfirm'), { count: eligible.length }))) return
    await postAction('unlink', eligible.map((row) => ({ productId: row.local!.id, externalProductId: row.external?.id })))
  }

  const importRows = async (targetRows: ProductChannelComparisonRow[], confirmBulk: boolean) => {
    const eligible = targetRows.filter((row) => row.status === 'only_provider' && row.external)
    if (eligible.length === 0) return
    if (confirmBulk && !window.confirm(interpolate(t('productChannel.confirmAction'), { count: eligible.length }))) return
    await postAction('import', eligible.map((row) => ({ externalProductId: row.external!.id })))
  }

  const saveOwnership = async (row: ProductChannelComparisonRow) => {
    if (!row.local) return
    const ownership = Object.fromEntries(comparableProductFields.map((field) => [field, ownershipDrafts[row.id]?.[field] ?? row.ownership[field] ?? 'manual'])) as Record<ComparableProductField, ProductFieldOwner>
    await postAction('set_ownership', [{ productId: row.local.id, externalProductId: row.external?.id }], ownership)
  }

  const statusLabel = (status: ProductChannelStatus) => t(`productChannel.status${status.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`)
  const fieldLabel = (field: ComparableProductField) => t(`productChannel.field${field[0].toUpperCase() + field.slice(1)}`)
  const displayValue = (value: unknown) => value === null || value === undefined || value === '' ? t('productChannel.noValue') : String(value)

  return (
    <>
      <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left lg:w-auto" onClick={() => setOpen(true)}><RefreshCw className="h-4 w-4" />{t('productChannel.open')}</Button>
      {open && <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5" role="presentation">
        <div role="dialog" aria-modal="true" aria-labelledby="channel-comparison-title" className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-lg">
          <header className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
            <div className="min-w-0"><h2 id="channel-comparison-title" className="break-words text-xl font-semibold">{t('productChannel.title')}</h2><p className="mt-1 text-sm text-slate-500">{t('productChannel.description')}</p></div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={close} aria-label={t('productChannel.close')}><X className="h-5 w-5" /></Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {connectedProviders.length === 0 ? <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm"><p>{t('productChannel.noConnected')}</p><Button asChild variant="outline" className="mt-3"><Link href="/app/settings/integrations">{t('productChannel.openSettings')}</Link></Button></div> : <>
              <div className="flex min-w-0 flex-wrap items-end gap-3">
                <label className="min-w-44 text-sm"><span className="mb-1 block font-medium">{t('productChannel.provider')}</span><select value={provider} onChange={(event) => setProvider(event.target.value as SupportedComparisonProvider)} className="h-10 w-full rounded-md border bg-white px-3">{connectedProviders.map((item) => <option key={item} value={item}>{item === 'woocommerce' ? 'WooCommerce' : 'Shopify'}</option>)}</select></label>
                <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || busy}><RefreshCw className={loading ? 'animate-spin' : ''} />{t('productChannel.refresh')}</Button>
                <span className="text-sm text-slate-500">{interpolate(t('productChannel.selected'), { count: selectedRows.length })}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{t('productChannel.syncManual')}</p>
              {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              {message && <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
              {loading ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="animate-spin" />{t('productChannel.loading')}</div> : rows.length === 0 ? <p className="py-10 text-sm text-slate-500">{t('productChannel.noRows')}</p> : <>
                {selectedRows.length > 0 && <div className="sticky top-0 z-10 mt-4 flex flex-wrap gap-2 border-y border-slate-200 bg-white/95 py-3 backdrop-blur">
                  <Button size="sm" variant="outline" onClick={() => void pushRows(selectedRows.filter((row) => row.status !== 'not_linked' && row.status !== 'conflict'), true)} disabled={busy}><ArrowUpFromLine />{t('productChannel.bulkPush')}</Button>
                  <Button size="sm" variant="outline" onClick={() => startPull(selectedRows)} disabled={busy}><ArrowDownToLine />{t('productChannel.bulkPull')}</Button>
                  <Button size="sm" variant="outline" onClick={() => void importRows(selectedRows, true)} disabled={busy}>{t('productChannel.bulkImport')}</Button>
                  <Button size="sm" variant="outline" onClick={() => void unlinkRows(selectedRows)} disabled={busy}><Unlink />{t('productChannel.bulkUnlink')}</Button>
                </div>}
                <div className="mt-4 grid min-w-0 gap-3">{rows.map((row) => {
                  const linked = linkedStatuses.includes(row.status)
                  const candidates = row.candidateExternalIds.map((id) => externalById.get(id)).filter(Boolean) as ExternalChannelProduct[]
                  return <article key={row.id} className="min-w-0 rounded-md border border-slate-200 bg-white p-3 sm:p-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next })} aria-label={`${t('productChannel.selected')} ${row.local?.name ?? row.external?.name ?? ''}`} />
                      <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                      {row.matchReason && <span className="text-xs text-slate-500">{t(`productChannel.match${row.matchReason === 'mapping' ? 'Mapping' : row.matchReason === 'sku' ? 'Sku' : row.matchReason === 'barcode' ? 'Barcode' : 'Name'}`)}</span>}
                      {row.syncError && <span className="min-w-0 break-words text-xs text-red-700">{row.syncError}</span>}
                    </div>
                    <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
                      <div className="min-w-0 rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{t('productChannel.leonety')}</p><p className="mt-1 break-words font-medium">{row.local?.name ?? '—'}</p><p className="mt-1 break-all text-xs text-slate-500">SKU: {displayValue(row.local?.sku)} · {t('productChannel.fieldBarcode')}: {displayValue(row.local?.barcode)}</p><p className="mt-1 text-sm">{t('productChannel.fieldPrice')}: {displayValue(row.local?.price)} · {t('productChannel.fieldStock')}: {displayValue(row.local?.stock)}</p></div>
                      <div className="min-w-0 rounded-md bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{t('productChannel.providerProduct')}</p><p className="mt-1 break-words font-medium">{row.external?.name ?? '—'}</p><p className="mt-1 break-all text-xs text-slate-500">{t('productChannel.externalId')}: {displayValue(row.external?.id)} · SKU: {displayValue(row.external?.sku)}</p><p className="mt-1 text-sm">{t('productChannel.fieldPrice')}: {displayValue(row.external?.price)} · {t('productChannel.fieldStock')}: {displayValue(row.external?.stock)}</p></div>
                    </div>
                    {row.differences.length > 0 && <p className="mt-2 text-xs text-amber-800"><span className="font-semibold">{t('productChannel.differences')}:</span> {row.differences.map(fieldLabel).join(', ')}</p>}
                    {row.matchReason === 'name_suggestion' && <p className="mt-2 text-xs text-amber-800">{t('productChannel.explicitSuggestion')}</p>}
                    {row.status === 'conflict' && row.local && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3"><p className="text-xs text-red-800">{t('productChannel.conflictHelp')}</p><div className="mt-2 flex flex-wrap gap-2"><select value={candidateSelections[row.id] ?? ''} onChange={(event) => setCandidateSelections((current) => ({ ...current, [row.id]:event.target.value }))} className="h-9 min-w-0 flex-1 rounded border bg-white px-2 text-sm"><option value="">{t('productChannel.chooseListing')}</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.sku || candidate.id}</option>)}</select><Button size="sm" onClick={() => void linkRow(row)} disabled={!candidateSelections[row.id] || busy}>{t('productChannel.resolve')}</Button></div></div>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.status === 'not_linked' && row.local && row.external && <Button size="sm" onClick={() => void linkRow(row)} disabled={busy}><Link2 />{t('productChannel.link')}</Button>}
                      {row.status === 'conflict' && row.matchReason === 'mapping' && row.local && <Button size="sm" variant="outline" onClick={() => void unlinkRows([row])} disabled={busy}><Unlink />{t('productChannel.unlink')}</Button>}
                      {row.status === 'only_provider' && <Button size="sm" onClick={() => void importRows([row], false)} disabled={busy}><ArrowDownToLine />{t('productChannel.import')}</Button>}
                      {row.status === 'only_leonety' && <Button size="sm" onClick={() => void pushRows([row], false)} disabled={busy}><ArrowUpFromLine />{t('productChannel.push')}</Button>}
                      {linked && <><Button size="sm" onClick={() => void pushRows([row], false)} disabled={busy}><ArrowUpFromLine />{t('productChannel.push')}</Button><Button size="sm" variant="outline" onClick={() => startPull([row])} disabled={busy}><ArrowDownToLine />{t('productChannel.pull')}</Button><Button size="sm" variant="outline" onClick={() => void unlinkRows([row])} disabled={busy}><Unlink />{t('productChannel.unlink')}</Button></>}
                    </div>
                    {linked && row.local && <details className="mt-3 rounded-md border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">{t('productChannel.ownership')}</summary><p className="mt-2 text-xs text-slate-500">{t('productChannel.ownershipDescription')}</p>{!preferencesAvailable && <p className="mt-2 text-xs text-amber-800">{t('productChannel.preferencesUnavailable')}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{comparableProductFields.map((field) => <label key={field} className="text-xs"><span className="mb-1 block font-medium">{fieldLabel(field)}</span><select value={ownershipDrafts[row.id]?.[field] ?? row.ownership[field] ?? 'manual'} onChange={(event) => setOwnershipDrafts((current) => ({ ...current, [row.id]:{ ...current[row.id], [field]:event.target.value as ProductFieldOwner } }))} disabled={!preferencesAvailable || busy} className="h-9 w-full rounded border bg-white px-2"><option value="manual">{t('productChannel.ownerManual')}</option><option value="leonety">{t('productChannel.ownerLeonety')}</option><option value="provider">{t('productChannel.ownerProvider')}</option></select></label>)}</div><Button size="sm" variant="outline" className="mt-3" onClick={() => void saveOwnership(row)} disabled={!preferencesAvailable || busy}>{t('productChannel.saveOwnership')}</Button></details>}
                  </article>
                })}</div>
              </>}
            </>}
          </div>
          {pullRows.length > 0 && <div className="border-t bg-slate-50 p-4 sm:p-5"><p className="font-medium">{t('productChannel.selectFields')}</p><div className="mt-2 flex flex-wrap gap-3">{pullAvailableFields.map((field) => <label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pullFields.has(field)} onChange={(event) => setPullFields((current) => { const next = new Set(current); if (event.target.checked) next.add(field); else next.delete(field); return next })} />{fieldLabel(field)}</label>)}</div><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void confirmPull()} disabled={pullFields.size === 0 || busy}>{busy && <Loader2 className="animate-spin" />}{t('productChannel.confirmPull')}</Button><Button variant="outline" onClick={() => { setPullRows([]); setPullAvailableFields([]) }} disabled={busy}>{t('productChannel.cancel')}</Button></div></div>}
          <footer className="flex justify-end border-t p-4 sm:p-5"><Button type="button" variant="outline" onClick={close} disabled={busy}>{t('productChannel.close')}</Button></footer>
        </div>
      </div>}
    </>
  )
}
