'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit, ExternalLink, Image as ImageIcon, Package, Warehouse } from 'lucide-react'
import { AppSelect } from '@/components/app-select'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useCurrencyFormat } from '@/contexts/currency-format-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'
import { safeExternalHttpUrl } from '@/lib/external-url'
import { getProductChannelPresentation, getProductChannelTranslationKey } from '@/lib/integration-presentation'
import { isProductLowStock, type ProductWorkspaceTab } from '@/lib/product-workspace'

interface ProductChannelSync {
  channel: string
  external_product_id: string | null
  external_url: string | null
  sync_status: 'not_synced' | 'pending' | 'synced' | 'failed'
  last_synced_at: string | null
  error_message: string | null
}

interface StockMovement {
  id: string
  type: string
  quantity: number
  reason: string | null
  notes: string | null
  created_at: string
}

const tabs: ProductWorkspaceTab[] = ['general', 'images', 'pricing', 'inventory', 'history', 'channels']

export default function ProductDetailsPage() {
  const { format: formatCurrency } = useCurrencyFormat()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ productId: string }>()
  const productId = typeof params.productId === 'string' ? params.productId : ''
  const [product, setProduct] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [channelSyncs, setChannelSyncs] = useState<ProductChannelSync[]>([])
  const [integrationError, setIntegrationError] = useState(false)
  const [channelConnections, setChannelConnections] = useState<Record<string, string>>({})
  const [connectionStatusUnavailable, setConnectionStatusUnavailable] = useState(false)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movementError, setMovementError] = useState(false)
  const [selectedTab, setSelectedTab] = useState<ProductWorkspaceTab>('general')

  useEffect(() => {
    if (!productId || !currentCompany) return
    let cancelled = false
    const scope = `${currentCompany.id}:${productId}`
    void Promise.all([
      supabase.from('products').select('*').eq('id', productId).eq('company_id', currentCompany.id).maybeSingle(),
      supabase.from('product_syncs').select('channel, external_product_id, external_url, sync_status, last_synced_at, error_message').eq('company_id', currentCompany.id).eq('product_id', productId),
      supabase.from('stock_movements').select('id, type, quantity, reason, notes, created_at').eq('company_id', currentCompany.id).eq('product_id', productId).order('created_at', { ascending: false }).limit(25),
      fetch(`/api/store-integrations?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Integration status unavailable')))
        .catch(() => ({ integrations: [], unavailable: true })),
    ]).then(([productResult, syncResult, movementResult, integrationResult]) => {
      if (cancelled) return
      setProduct(productResult.error || !productResult.data ? null : productResult.data as Record<string, unknown>)
      setFailed(Boolean(productResult.error))
      setChannelSyncs(syncResult.error ? [] : (syncResult.data ?? []) as ProductChannelSync[])
      setIntegrationError(Boolean(syncResult.error))
      setMovements(movementResult.error ? [] : (movementResult.data ?? []) as StockMovement[])
      setMovementError(Boolean(movementResult.error))
      setChannelConnections(Object.fromEntries((integrationResult.integrations ?? []).map((integration: { provider: string; status: string }) => [integration.provider, integration.status])))
      setConnectionStatusUnavailable(Boolean(integrationResult.unavailable))
      setLoadedScope(scope)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setFailed(true)
      setIntegrationError(true)
      setMovementError(true)
      setLoadedScope(scope)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [currentCompany, productId, supabase])

  const tabOptions = useMemo(() => tabs.map((tab) => ({
    value: tab,
    label: tab === 'general' ? t('products.editor.general')
      : tab === 'images' ? t('products.editor.image')
        : tab === 'pricing' ? t('products.editor.pricing')
          : tab === 'inventory' ? t('products.editor.inventory')
            : tab === 'history' ? t('products.workspace.history')
              : t('products.channelsTitle'),
  })), [t])

  if (companyLoading || (currentCompany && (loading || loadedScope !== `${currentCompany.id}:${productId}`))) return <PageContainer><PageHeader title={t('products.view')} /><LoadingSkeleton /></PageContainer>
  if (!product) return <PageContainer><EmptyState icon={Package} title={t('products.notFound')} description={failed ? t('products.loadError') : t('products.notFoundDescription')} action={{ label: t('products.backToProducts'), onClick: () => router.push('/app/products') }} /></PageContainer>

  const editHref = (section: string) => `/app/products/${encodeURIComponent(productId)}/edit?section=${section}`
  const imageUrl = typeof product.image_url === 'string' ? product.image_url : ''
  const stock = Number(product.current_stock ?? 0)
  const lowStockThreshold = Number(product.low_stock_threshold ?? 0)
  const lowStock = product.status === 'active' && isProductLowStock(stock, lowStockThreshold)
  const syncsForDisplay = channelSyncs.length > 0
    ? channelSyncs
    : !integrationError && channelConnections.woocommerce === 'connected'
      ? [{ channel: 'woocommerce', external_product_id: null, external_url: null, sync_status: 'not_synced' as const, last_synced_at: null, error_message: null }]
      : []
  const movementRows = (rows: StockMovement[]) => rows.map((movement) => (
    <li key={movement.id} className="flex min-w-0 flex-col gap-1 border-t py-3 first:border-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{movement.reason || movement.type.replaceAll('_', ' ')}</p>
        {movement.notes && <p className="break-words text-sm text-slate-600">{movement.notes}</p>}
        <time className="text-xs text-slate-500" dateTime={movement.created_at}>{new Date(movement.created_at).toLocaleString()}</time>
      </div>
      <span className="shrink-0 text-sm font-semibold">{movement.quantity}</span>
    </li>
  ))

  return <PageContainer>
    <PageHeader title={String(product.name ?? '')} description={`${String(product.category ?? t('products.noCategory'))} · ${currentCompany?.name ?? ''}`}>
      <Link href="/app/products"><Button variant="outline"><ArrowLeft className="h-4 w-4" />{t('products.backToProducts')}</Button></Link>
      <Link href={editHref('general')}><Button><Edit className="h-4 w-4" />{t('common.edit')}</Button></Link>
    </PageHeader>

    <div className="mb-4 sm:hidden">
      <AppSelect value={selectedTab} options={tabOptions} onChange={(value) => setSelectedTab(value as ProductWorkspaceTab)} ariaLabel={t('products.workspace.selectSection')} className="w-full" />
    </div>
    <div role="tablist" aria-label={t('products.workspace.selectSection')} className="mb-4 hidden gap-2 overflow-x-auto border-b sm:flex">
      {tabOptions.map((tab, index) => <button key={tab.value} id={`product-tab-${tab.value}`} role="tab" type="button" tabIndex={selectedTab === tab.value ? 0 : -1} aria-selected={selectedTab === tab.value} aria-controls="product-panel" onClick={() => setSelectedTab(tab.value)} onKeyDown={(event) => {
        const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabOptions.length : event.key === 'ArrowLeft' ? (index - 1 + tabOptions.length) % tabOptions.length : -1
        if (nextIndex >= 0) {
          event.preventDefault()
          setSelectedTab(tabOptions[nextIndex].value as ProductWorkspaceTab)
          document.getElementById(`product-tab-${tabOptions[nextIndex].value}`)?.focus()
        }
      }} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${selectedTab === tab.value ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-950'}`}>{tab.label}</button>)}
    </div>

    <section id="product-panel" role="tabpanel" aria-labelledby={`product-tab-${selectedTab}`} className="min-w-0">
      {selectedTab === 'general' && <Card>
        <CardHeader><CardTitle>{t('products.editor.general')}</CardTitle></CardHeader>
        <CardContent className="grid min-w-0 gap-5 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)]">
          {imageUrl ? <img src={imageUrl} alt={String(product.name ?? '')} className="aspect-square w-full rounded-md border object-contain" /> : <div className="flex aspect-square items-center justify-center rounded-md border bg-slate-50 text-slate-400"><Package className="h-10 w-10" /></div>}
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">{t('products.sku')}</dt><dd className="break-all font-medium">{String(product.sku || '—')}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('products.barcode')}</dt><dd className="break-all font-medium">{String(product.barcode || '—')}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('products.category')}</dt><dd className="break-words font-medium">{String(product.category || t('products.noCategory'))}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('products.status')}</dt><dd className="font-medium">{t(`products.status.${String(product.status ?? 'active')}`)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-500">{t('products.descriptionField')}</dt><dd className="whitespace-pre-wrap break-words">{String(product.description || '—')}</dd></div>
          </dl>
        </CardContent>
      </Card>}

      {selectedTab === 'images' && <Card>
        <CardHeader><CardTitle>{t('products.editor.image')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {imageUrl ? <img src={imageUrl} alt={String(product.name ?? '')} className="mx-auto max-h-[min(70vh,42rem)] w-full rounded-md border object-contain" /> : <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center text-slate-500"><ImageIcon className="h-8 w-8" /><p>{t('products.workspace.noImage')}</p></div>}
          <Link href={editHref('image')}><Button variant="outline"><ImageIcon className="h-4 w-4" />{t('products.workspace.editImages')}</Button></Link>
        </CardContent>
      </Card>}

      {selectedTab === 'pricing' && <Card>
        <CardHeader><CardTitle>{t('products.editor.pricing')}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div><p className="text-sm text-slate-500">{t('products.purchasePrice')}</p><p className="text-lg font-semibold">{product.purchase_price == null ? '—' : formatCurrency(Number(product.purchase_price), String(product.currency ?? 'EUR'))}</p></div>
          <div><p className="text-sm text-slate-500">{t('products.sellingPrice')}</p><p className="text-lg font-semibold">{product.selling_price == null ? '—' : formatCurrency(Number(product.selling_price), String(product.currency ?? 'EUR'))}</p></div>
          <div><p className="text-sm text-slate-500">{t('products.workspace.currency')}</p><p className="font-medium">{String(product.currency ?? 'EUR')}</p></div>
          <div className="sm:col-span-2"><Link href={editHref('pricing')}><Button variant="outline"><Edit className="h-4 w-4" />{t('products.workspace.editPricing')}</Button></Link></div>
        </CardContent>
      </Card>}

      {selectedTab === 'inventory' && <div className="space-y-4">
        <Card><CardHeader><CardTitle>{t('products.editor.inventory')}</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><Warehouse className="h-5 w-5 text-slate-500" /><p className="text-lg font-semibold">{t('products.currentStock')}: {stock}</p><span className={`rounded-sm px-2 py-1 text-sm ${lowStock ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900'}`}>{lowStock ? t('products.workspace.lowStock') : product.status === 'active' ? t('products.workspace.inStock') : t(`products.status.${String(product.status)}`)}</span></div>
          <p className="text-sm text-slate-600">{t('products.workspace.stockThreshold')}: {lowStockThreshold}</p>
          <p className="text-sm text-slate-500">{t('products.stockManagedByMovements')}</p>
          <div className="flex flex-wrap gap-2"><Link href={`/app/stock-movements?productId=${encodeURIComponent(productId)}`}><Button>{t('products.adjustStock')}</Button></Link><Link href={editHref('inventory')}><Button variant="outline"><Edit className="h-4 w-4" />{t('products.workspace.editInventory')}</Button></Link></div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>{t('products.workspace.movementHistory')}</CardTitle></CardHeader><CardContent>
          {movementError ? <p role="alert" className="text-sm text-red-700">{t('products.workspace.historyUnavailable')}</p> : movements.length ? <ul>{movementRows(movements.slice(0, 8))}</ul> : <p className="text-sm text-slate-500">{t('products.workspace.noMovements')}</p>}
        </CardContent></Card>
      </div>}

      {selectedTab === 'history' && <Card>
        <CardHeader><CardTitle>{t('products.workspace.history')}</CardTitle></CardHeader>
        <CardContent>
          <ul className="mb-4 space-y-3 border-l-2 border-slate-200 pl-4">
            {typeof product.created_at === 'string' && <li><p className="text-sm font-medium">{t('products.workspace.created')}</p><time className="text-xs text-slate-500" dateTime={product.created_at}>{new Date(product.created_at).toLocaleString()}</time></li>}
            {typeof product.updated_at === 'string' && product.updated_at !== product.created_at && <li><p className="text-sm font-medium">{t('products.workspace.updated')}</p><time className="text-xs text-slate-500" dateTime={product.updated_at}>{new Date(product.updated_at).toLocaleString()}</time></li>}
          </ul>
          {movementError ? <p role="alert" className="text-sm text-red-700">{t('products.workspace.historyUnavailable')}</p> : movements.length ? <ul>{movementRows(movements)}</ul> : <p className="text-sm text-slate-500">{t('products.workspace.noHistory')}</p>}
        </CardContent>
      </Card>}

      {selectedTab === 'channels' && <Card>
        <CardHeader><CardTitle>{t('products.channelsTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {integrationError ? <p role="alert" className="text-sm text-red-700">{t('products.channelStatus.loadError')}</p> : null}
          {connectionStatusUnavailable && <p role="status" className="text-sm text-amber-800">{t('products.workspace.connectionUnavailable')}</p>}
          {!integrationError && syncsForDisplay.length === 0 && <p className="text-sm text-slate-600">{t('products.workspace.noChannelStates')}</p>}
          {syncsForDisplay.map((sync) => {
            const status = getProductChannelPresentation(sync)
            const externalUrl = status === 'published' ? safeExternalHttpUrl(sync.external_url) : null
            const connection = channelConnections[sync.channel]
            const editLabel = status === 'published' || status === 'update_pending' ? t('products.workspace.update') : t('products.workspace.publish')
            return <div key={sync.channel} className="min-w-0 border-t pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{t(`integrations.${sync.channel}`) === `integrations.${sync.channel}` ? sync.channel.replaceAll('_', ' ') : t(`integrations.${sync.channel}`)}</p>
                  <p className="text-xs text-slate-500">{connectionStatusUnavailable ? t('products.workspace.connectionUnavailable') : connection === 'connected' ? t('integrations.connected') : connection === 'error' ? t('common.error') : t('integrations.notConnected')}</p>
                  <p className={`text-sm ${status === 'error' ? 'text-red-700' : status === 'published' ? 'text-green-700' : 'text-slate-600'}`}>{t(`products.channelStatus.${getProductChannelTranslationKey(sync)}`)}</p>
                  {sync.last_synced_at && <p className="text-xs text-slate-500">{t('products.workspace.lastSync')}: {new Date(sync.last_synced_at).toLocaleString()}</p>}
                  {sync.error_message && <p className="break-words text-xs text-red-700">{sync.error_message}</p>}
                  {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-2 break-all text-sm font-medium text-blue-700 underline"><ExternalLink className="h-4 w-4 shrink-0" />{t('products.channelStatus.viewExternalProduct')}</a>}
                  {status === 'published' && !externalUrl && <p className="text-xs text-slate-500">{t('products.channelStatus.externalLinkUnavailable')}</p>}
                </div>
                {sync.channel === 'woocommerce' && connection === 'connected' && <Link href={editHref('integration')}><Button variant="outline">{editLabel}</Button></Link>}
              </div>
            </div>
          })}
          {syncsForDisplay.length > 0 && <Link href={editHref('integration')} className="inline-block"><Button variant="outline"><Edit className="h-4 w-4" />{t('products.workspace.editChannels')}</Button></Link>}
        </CardContent>
      </Card>}
    </section>
  </PageContainer>
}
