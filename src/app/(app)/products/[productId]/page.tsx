'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Package, Warehouse } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCurrency } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'

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
  useEffect(() => {
    if (!productId || !currentCompany) return
    let cancelled = false
    void supabase.from('products').select('*').eq('id', productId).eq('company_id', currentCompany.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      setProduct(error || !data ? null : data as Record<string, unknown>)
      setFailed(Boolean(error))
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
      </div>
    </div>
  </PageContainer>
}
