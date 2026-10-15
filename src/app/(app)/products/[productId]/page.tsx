'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit, ExternalLink, Package, Warehouse } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCurrency } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'
import { safeExternalHttpUrl } from '@/lib/external-url'
import { getProductChannelPresentation } from '@/lib/integration-presentation'

interface ProductChannelSync {
  channel: string
  external_product_id: string | null
  external_url: string | null
  sync_status: 'not_synced' | 'pending' | 'synced' | 'failed'
  last_synced_at: string | null
  error_message: string | null
}

export default function ProductDetailsPage() {
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ productId: string }>()
  const productId = typeof params.productId === 'string' ? params.productId : ''
  const [product, setProduct] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [channelSyncs, setChannelSyncs] = useState<ProductChannelSync[]>([])
  const [integrationError, setIntegrationError] = useState(false)
  const [channelConnections, setChannelConnections] = useState<Record<string, string>>({})
  const [connectionStatusUnavailable, setConnectionStatusUnavailable] = useState(false)
  useEffect(() => {
    if (!productId || !currentCompany) return
    let cancelled = false
    void Promise.all([
      supabase.from('products').select('*').eq('id', productId).eq('company_id', currentCompany.id).maybeSingle(),
      supabase.from('product_syncs').select('channel, external_product_id, external_url, sync_status, last_synced_at, error_message').eq('company_id', currentCompany.id).eq('product_id', productId),
      fetch(`/api/store-integrations?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Integration status unavailable')))
        .catch(() => ({ integrations: [], unavailable: true })),
    ]).then(([productResult, syncResult, integrationResult]) => {
      if (cancelled) return
      setProduct(productResult.error || !productResult.data ? null : productResult.data as Record<string, unknown>)
      setFailed(Boolean(productResult.error))
      setChannelSyncs(syncResult.error ? [] : (syncResult.data ?? []) as ProductChannelSync[])
      setIntegrationError(Boolean(syncResult.error))
      setChannelConnections(Object.fromEntries((integrationResult.integrations ?? []).map((integration: { provider: string; status: string }) => [integration.provider, integration.status])))
      setConnectionStatusUnavailable(Boolean(integrationResult.unavailable))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [currentCompany, productId, supabase])
  if (companyLoading || (currentCompany && loading)) return <PageContainer><PageHeader title={t('products.view')} /><LoadingSkeleton /></PageContainer>
  if (!product) return <PageContainer><EmptyState icon={Package} title={t('products.notFound')} description={failed ? t('products.loadError') : t('products.notFoundDescription')} action={{ label: t('products.backToProducts'), onClick: () => router.push('/app/products') }} /></PageContainer>
  return <PageContainer>
    <PageHeader title={String(product.name ?? '')} description={`${String(product.category ?? t('products.noCategory'))} · ${currentCompany?.name ?? ''}`}>
      <Link href="/app/products"><Button variant="outline"><ArrowLeft className="h-4 w-4" />{t('products.backToProducts')}</Button></Link>
      <Link href={`/app/products/${encodeURIComponent(productId)}/edit`}><Button><Edit className="h-4 w-4" />{t('common.edit')}</Button></Link>
    </PageHeader>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)]">
      <Card><CardContent className="p-4">{typeof product.image_url === 'string' && product.image_url ? <img src={product.image_url} alt="" className="mx-auto aspect-square w-full max-w-lg rounded-md border object-contain" /> : <div className="flex aspect-square items-center justify-center rounded-md border bg-slate-50 text-slate-400"><Package className="h-10 w-10" /></div>}</CardContent></Card>
      <div className="space-y-4">
        <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2"><div><p className="text-xs text-slate-500">{t('products.sku')}</p><p className="break-all font-medium">{String(product.sku || '—')}</p></div><div><p className="text-xs text-slate-500">{t('products.barcode')}</p><p className="break-all font-medium">{String(product.barcode || '—')}</p></div><div><p className="text-xs text-slate-500">{t('products.sellingPrice')}</p><p className="font-semibold">{product.selling_price == null ? '—' : formatCurrency(Number(product.selling_price), String(product.currency ?? 'EUR'))}</p></div><div><p className="text-xs text-slate-500">{t('products.status')}</p><p className="font-medium">{t(`products.status.${String(product.status ?? 'active')}`)}</p></div><div className="sm:col-span-2"><p className="text-xs text-slate-500">{t('products.descriptionField')}</p><p className="whitespace-pre-wrap break-words">{String(product.description ?? '—')}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-start gap-3 p-4"><Warehouse className="mt-0.5 h-5 w-5 text-slate-500" /><div><p className="text-sm font-medium">{t('products.currentStock')}: {String(product.current_stock ?? 0)}</p><p className="text-xs text-slate-500">{t('products.stockManagedByMovements')}</p><Link className="mt-3 inline-block" href="/app/stock-movements"><Button variant="outline">{t('products.adjustStock')}</Button></Link></div></CardContent></Card>
        <Card><CardContent className="space-y-3 p-4">
          <h2 className="font-semibold">{t('products.channelsTitle')}</h2>
          {integrationError ? <p className="text-sm text-red-700">{t('products.channelStatus.loadError')}</p> : (channelSyncs.length > 0 ? channelSyncs : [{ channel: 'woocommerce', external_product_id: null, external_url: null, sync_status: 'not_synced' as const, last_synced_at: null, error_message: null }]).map((sync) => {
            const status = getProductChannelPresentation(sync)
            const externalUrl = status === 'published' ? safeExternalHttpUrl(sync.external_url) : null
            return <div key={sync.channel} className="min-w-0 border-t pt-3 first:border-0 first:pt-0">
              <p className="font-medium">{sync.channel.replaceAll('_', ' ')}</p>
              <p className="text-xs text-slate-500">{connectionStatusUnavailable ? t('products.channelStatus.loadError') : channelConnections[sync.channel] === 'connected' ? t('integrations.connected') : channelConnections[sync.channel] === 'error' ? t('common.error') : t('integrations.notConnected')}</p>
              <p className={`text-sm ${status === 'error' ? 'text-red-700' : status === 'published' ? 'text-green-700' : 'text-slate-600'}`}>
                {t(`products.channelStatus.${status === 'error' ? 'syncError' : status === 'pending' ? 'pending' : status === 'published' ? 'published' : 'notPublished'}`)}
              </p>
              {sync.error_message && <p className="break-words text-xs text-red-700">{sync.error_message}</p>}
              {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-2 break-all text-sm font-medium text-blue-700 underline">
                <ExternalLink className="h-4 w-4 shrink-0" />{t('products.channelStatus.viewExternalProduct')}
              </a>}
              {status === 'published' && !externalUrl && <p className="text-xs text-slate-500">{t('products.channelStatus.externalLinkUnavailable')}</p>}
            </div>
          })}
          <Link href={`/app/products/${encodeURIComponent(productId)}/edit`} className="inline-block"><Button variant="outline">{t('common.edit')}</Button></Link>
        </CardContent></Card>
      </div>
    </div>
  </PageContainer>
}
