'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { normalizeProductCsvRows, parseProductCsv, productCsvFields, type ParsedProductCsv, type ProductCsvExportFormat, type ProductCsvField, type ProductCsvFormat, type ProductCsvMapping } from '@/lib/product-csv'

interface PreviewRow {
  sourceRow: number
  name: string
  sku: string
  barcode: string
  category: string
  price: number | null
  stock: number
  classification: 'new' | 'existing' | 'conflict' | 'invalid'
  reasons: string[]
  matchedProductId?: string
  matchedProductName?: string
  [key: string]: unknown
}

interface Props {
  companyId: string
  currency: string
  selectedProductIds: string[]
  visibleProductIds: string[]
  totalProducts: number
  onImported: (created: number, updated: number) => Promise<void> | void
}

const fieldLabels: Record<ProductCsvField, string> = {
  name:'name',description:'descriptionField',sku:'sku',barcode:'barcode',category:'category',price:'price',currency:'currency',stock:'stock',image_url:'imageUrl',status:'status',external_id:'externalId',
}

function replaceTokens(value: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce((text, [token, replacement]) => text.replace(`{${token}}`, String(replacement)), value)
}

function reasonKey(reason: string) {
  const keys: Record<string, string> = {
    name_required:'nameRequired',price_invalid:'priceInvalid',stock_invalid:'stockInvalid',duplicate_sku_in_file:'duplicateSku',duplicate_barcode_in_file:'duplicateBarcode',duplicate_external_id_in_file:'duplicateExternal',identifiers_match_different_products:'identifiersConflict',
  }
  return keys[reason]
}

export function ProductCsvDialog({ companyId, currency, selectedProductIds, visibleProductIds, totalProducts, onImported }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'import' | 'export'>('import')
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedProductCsv | null>(null)
  const [format, setFormat] = useState<ProductCsvFormat>('leonety')
  const [mapping, setMapping] = useState<ProductCsvMapping>({})
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<'parse' | 'preview' | 'import' | 'export' | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [exportScope, setExportScope] = useState<'selected' | 'visible' | 'all'>(selectedProductIds.length ? 'selected' : 'visible')
  const [exportFormat, setExportFormat] = useState<ProductCsvExportFormat>('leonety')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useBodyScrollLock(open)

  const pageRows = useMemo(() => previewRows.slice(page * 100, page * 100 + 100), [page, previewRows])
  const pageCount = Math.max(1, Math.ceil(previewRows.length / 100))
  const counts = useMemo(() => previewRows.reduce((result, row) => ({ ...result, [row.classification]: result[row.classification] + 1 }), { new:0,existing:0,conflict:0,invalid:0 }), [previewRows])
  const selectedExisting = previewRows.some((row) => row.classification === 'existing' && selectedRows.has(row.sourceRow))

  const resetImport = () => {
    setFile(null); setParsed(null); setMapping({}); setPreviewRows([]); setSelectedRows(new Set()); setPage(0); setError(''); setSuccess('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    resetImport()
  }

  const parseFile = async () => {
    if (!file) return
    setBusy('parse'); setError(''); setSuccess('')
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('too_large')
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const result = parseProductCsv(await file.text())
      setParsed(result); setFormat(result.format); setMapping(result.mapping); setPreviewRows([]); setPage(0)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : 'malformed_csv'
      setError(code === 'too_many_rows' || code === 'too_large' ? t('productCsv.tooLarge') : t('productCsv.malformed'))
    } finally {
      setBusy(null)
    }
  }

  const buildNormalizedRows = () => parsed ? normalizeProductCsvRows(parsed.rows, mapping, currency) : []

  const preview = async () => {
    if (!parsed || !mapping.name) return
    setBusy('preview'); setError(''); setSuccess('')
    try {
      const response = await fetch('/api/products/csv-import', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ companyId,format,rows:buildNormalizedRows(),fieldsPresent:productCsvFields.filter((field) => Boolean(mapping[field])) }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error('import_failed')
      const rows = Array.isArray(payload.rows) ? payload.rows as PreviewRow[] : []
      setPreviewRows(rows); setSelectedRows(new Set(rows.filter((row) => row.classification === 'new').map((row) => row.sourceRow))); setPage(0)
    } catch {
      setError(t('productCsv.importFailed'))
    } finally {
      setBusy(null)
    }
  }

  const confirmImport = async () => {
    if (!parsed || selectedRows.size === 0 || busy) return
    setBusy('import'); setError(''); setSuccess('')
    try {
      const decisions = previewRows.filter((row) => selectedRows.has(row.sourceRow)).map((row) => ({ sourceRow:row.sourceRow,mode:row.classification === 'existing' ? 'update' : 'create',productId:row.matchedProductId }))
      const response = await fetch('/api/products/csv-import', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ companyId,format,rows:buildNormalizedRows(),fieldsPresent:productCsvFields.filter((field) => Boolean(mapping[field])),confirm:true,decisions }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload.error === 'preview_changed') throw new Error(t('productCsv.previewChanged'))
        if (payload.error === 'duplicate_identifier') throw new Error(t('productCsv.duplicateIdentifier'))
        throw new Error(t('productCsv.importFailed'))
      }
      const created = Number(payload.created) || 0
      const updated = Number(payload.updated) || 0
      setSuccess(replaceTokens(t('productCsv.importSuccess'), { created, updated }))
      setSelectedRows(new Set())
      await onImported(created, updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('productCsv.importFailed'))
    } finally {
      setBusy(null)
    }
  }

  const exportCsv = async () => {
    setBusy('export'); setError(''); setSuccess('')
    try {
      const productIds = exportScope === 'selected' ? selectedProductIds : exportScope === 'visible' ? visibleProductIds : []
      const response = await fetch('/api/products/csv-export', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ companyId,format:exportFormat,scope:exportScope,productIds }) })
      if (!response.ok) throw new Error('export_failed')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'leonety-products.csv'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
    } catch {
      setError(t('productCsv.exportFailed'))
    } finally {
      setBusy(null)
    }
  }

  const toggleRow = (row: PreviewRow) => {
    if (row.classification === 'invalid' || row.classification === 'conflict') return
    setSelectedRows((current) => { const next = new Set(current); if (next.has(row.sourceRow)) next.delete(row.sourceRow); else next.add(row.sourceRow); return next })
  }

  const statusClass = (classification: PreviewRow['classification']) => classification === 'new' ? 'bg-emerald-100 text-emerald-800' : classification === 'existing' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'

  return <>
    <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left lg:w-auto" onClick={() => setOpen(true)}><FileSpreadsheet className="h-4 w-4 shrink-0" />{t('productCsv.title')}</Button>
    {open && <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="product-csv-title" className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-lg">
        <header className="flex items-start justify-between gap-4 border-b p-4 sm:p-5"><div className="min-w-0"><h2 id="product-csv-title" className="text-xl font-semibold">{t('productCsv.title')}</h2><p className="mt-1 text-sm text-slate-500">{t('productCsv.description')}</p></div><Button type="button" variant="ghost" size="icon" onClick={close} aria-label={t('productCsv.close')}><X className="h-5 w-5" /></Button></header>
        <div className="flex gap-1 border-b px-4 pt-3 sm:px-5" role="tablist"><button type="button" role="tab" aria-selected={tab === 'import'} onClick={() => { setTab('import');setError('') }} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'import' ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500'}`}><Upload className="mr-2 inline h-4 w-4" />{t('productCsv.importTab')}</button><button type="button" role="tab" aria-selected={tab === 'export'} onClick={() => { setTab('export');setError('') }} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'export' ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500'}`}><Download className="mr-2 inline h-4 w-4" />{t('productCsv.exportTab')}</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {success && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
          {tab === 'import' ? <div className="space-y-5">
            <section className="grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="min-w-0 space-y-1"><span className="block text-sm font-medium">{t('productCsv.chooseFile')}</span><input ref={inputRef} type="file" accept=".csv,text/csv" className="block w-full max-w-full text-sm" onChange={(event) => { setFile(event.target.files?.[0] ?? null);setParsed(null);setPreviewRows([]);setError('');setSuccess('') }} /><span className="block text-xs text-slate-500">{t('productCsv.supportedFiles')}</span></label><Button type="button" disabled={!file || busy !== null} onClick={() => void parseFile()}>{busy === 'parse' && <Loader2 className="h-4 w-4 animate-spin" />}{t('productCsv.parse')}</Button></section>
            {parsed && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 sm:items-end"><label className="space-y-1"><span className="block text-sm font-medium">{t('productCsv.format')}</span><AppSelect value={format} onChange={(value) => setFormat(value as ProductCsvFormat)} options={[{value:'leonety',label:t('productCsv.leonety')},{value:'woocommerce',label:t('productCsv.woocommerce')}]} /></label><p className="text-sm text-slate-500">{parsed.rows.length} {t('productCsv.row').toLowerCase()}</p></div><div><h3 className="font-semibold">{t('productCsv.mappingTitle')}</h3><p className="text-sm text-slate-500">{t('productCsv.mappingDescription')}</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{productCsvFields.map((field) => <label key={field} className="min-w-0 space-y-1"><span className="block text-sm font-medium">{t(`productCsv.${fieldLabels[field]}`)}</span><AppSelect value={mapping[field] ?? ''} onChange={(value) => { setMapping((current) => ({...current,[field]:value || undefined}));setPreviewRows([]) }} options={[{value:'',label:t('productCsv.ignore')},...parsed.headers.map((header) => ({value:header,label:header}))]} /></label>)}</div><Button type="button" disabled={!mapping.name || busy !== null} onClick={() => void preview()}>{busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />}{t('productCsv.preview')}</Button></section>}
            {previewRows.length > 0 && <section className="space-y-4"><div><h3 className="font-semibold">{t('productCsv.reviewTitle')}</h3><p className="text-sm text-slate-500">{t('productCsv.reviewDescription')}</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['new','existing','conflict','invalid'] as const).map((state) => <div key={state} className="rounded border p-3"><div className="text-xs text-slate-500">{t(`productCsv.state${state[0].toUpperCase()}${state.slice(1)}`)}</div><div className="text-xl font-semibold">{counts[state]}</div></div>)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={counts.new > 0 && previewRows.filter((row) => row.classification === 'new').every((row) => selectedRows.has(row.sourceRow))} onChange={(event) => setSelectedRows((current) => { const next = new Set(current); for (const row of previewRows.filter((item) => item.classification === 'new')) { if (event.target.checked) next.add(row.sourceRow); else next.delete(row.sourceRow) } return next })} />{t('productCsv.selectAllSafe')}</label><div className="space-y-2">{pageRows.map((row) => <article key={row.sourceRow} className="grid min-w-0 gap-3 rounded-md border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start"><input type="checkbox" checked={selectedRows.has(row.sourceRow)} disabled={row.classification === 'invalid' || row.classification === 'conflict'} onChange={() => toggleRow(row)} aria-label={`${t('productCsv.selected')} ${row.name}`} /><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><strong className="break-words">{row.name || `#${row.sourceRow}`}</strong><span className={`rounded px-2 py-0.5 text-xs font-medium ${statusClass(row.classification)}`}>{t(`productCsv.state${row.classification[0].toUpperCase()}${row.classification.slice(1)}`)}</span></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{t('productCsv.row')} {row.sourceRow}</span>{row.sku && <span>{t('productCsv.sku')}: {row.sku}</span>}{row.barcode && <span>{t('productCsv.barcode')}: {row.barcode}</span>}{row.matchedProductName && <span>{t('productCsv.matchedProduct')}: {row.matchedProductName}</span>}</div>{row.reasons.length > 0 && <p className="mt-2 text-xs text-red-700">{row.reasons.map((reason) => t(`productCsv.${reasonKey(reason) || 'importFailed'}`)).join(' ')}</p>}</div><div className="text-right text-sm"><div>{row.price ?? '—'} {currency}</div><div className="text-xs text-slate-500">{t('productCsv.stock')}: {row.stock}</div></div></article>)}</div>{pageCount > 1 && <div className="flex items-center justify-center gap-3"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>{t('productCsv.back')}</Button><span className="text-sm">{page + 1} / {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>{t('common.next')}</Button></div>}{selectedExisting && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('productCsv.updateWarning')}</p>}</section>}
          </div> : <div className="space-y-5"><section><h3 className="font-semibold">{t('productCsv.exportScope')}</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{([{value:'selected',label:'scopeSelected',count:'selectedCount',number:selectedProductIds.length},{value:'visible',label:'scopeVisible',count:'visibleCount',number:visibleProductIds.length},{value:'all',label:'scopeAll',count:'allCount',number:totalProducts}] as const).map((option) => <label key={option.value} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${exportScope === option.value ? 'border-slate-900 bg-slate-50' : ''}`}><input type="radio" name="export-scope" value={option.value} checked={exportScope === option.value} disabled={option.value !== 'all' && option.number === 0} onChange={() => setExportScope(option.value)} /><span><span className="block font-medium">{t(`productCsv.${option.label}`)}</span><span className="text-xs text-slate-500">{replaceTokens(t(`productCsv.${option.count}`), {count:option.number})}</span></span></label>)}</div></section><label className="block max-w-md space-y-1"><span className="block text-sm font-medium">{t('productCsv.exportFormat')}</span><AppSelect value={exportFormat} onChange={(value) => setExportFormat(value as ProductCsvExportFormat)} options={[{value:'leonety',label:t('productCsv.leonety')},{value:'woocommerce',label:t('productCsv.woocommerce')},{value:'shopify',label:t('productCsv.shopify')},{value:'google_basic',label:t('productCsv.googleBasic')}]} /></label>{exportFormat === 'google_basic' && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('productCsv.googleNotice')}</p>}</div>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-white p-4 sm:p-5"><Button type="button" variant="outline" onClick={close} disabled={busy !== null}>{t('productCsv.cancel')}</Button>{tab === 'import' && previewRows.length > 0 && <Button type="button" disabled={selectedRows.size === 0 || busy !== null} onClick={() => void confirmImport()}>{busy === 'import' && <Loader2 className="h-4 w-4 animate-spin" />}{busy === 'import' ? t('productCsv.importing') : t('productCsv.confirmImport')} ({selectedRows.size})</Button>}{tab === 'export' && <Button type="button" disabled={busy !== null || (exportScope === 'selected' && selectedProductIds.length === 0) || (exportScope === 'visible' && visibleProductIds.length === 0)} onClick={() => void exportCsv()}>{busy === 'export' && <Loader2 className="h-4 w-4 animate-spin" />}{busy === 'export' ? t('productCsv.exporting') : t('productCsv.export')}</Button>}</footer>
      </div>
    </div>}
  </>
}
