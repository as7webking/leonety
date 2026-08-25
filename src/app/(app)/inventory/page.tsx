'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Boxes, BriefcaseBusiness, Building2, Package } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

interface ProductStock {
  id: string
  name: string
  sku: string | null
  current_stock: number
  low_stock_threshold: number
  status: string
}

export default function InventoryPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [products, setProducts] = useState<ProductStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadInventory = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('products')
      .select('id, name, sku, current_stock, low_stock_threshold, status')
      .eq('company_id', currentCompany.id)
      .neq('status', 'archived')
      .order('name')
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setProducts([])
    } else {
      setProducts((data ?? []).map((product) => ({
        ...product,
        current_stock: Number(product.current_stock),
        low_stock_threshold: Number(product.low_stock_threshold),
      })))
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadInventory()
    })
    return () => { cancelled = true }
  }, [loadInventory])

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('inventory.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('inventory.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  const activeProducts = products.filter((product) => product.status === 'active')
  const lowStockProducts = activeProducts.filter((product) => product.current_stock <= product.low_stock_threshold)
  const totalUnits = activeProducts.reduce((sum, product) => sum + product.current_stock, 0)

  return (
    <PageContainer>
      <PageHeader title={t('inventory.title')} description={`${t('inventory.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2"><Link href="/app/products"><Button variant="outline">{t('products.title')}</Button></Link><Link href="/app/stock-movements"><Button>{t('stock.add')}</Button></Link></div>
      </PageHeader>

      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-5"><Package className="h-8 w-8 text-blue-600" /><div><p className="text-sm text-slate-500">{t('inventory.productsCount')}</p><p className="text-2xl font-semibold">{activeProducts.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><Boxes className="h-8 w-8 text-slate-700" /><div><p className="text-sm text-slate-500">{t('inventory.totalUnits')}</p><p className="text-2xl font-semibold">{totalUnits}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-5"><AlertTriangle className="h-8 w-8 text-amber-600" /><div><p className="text-sm text-slate-500">{t('inventory.lowStockCount')}</p><p className="text-2xl font-semibold">{lowStockProducts.length}</p></div></CardContent></Card>
      </div>

      {products.length === 0 ? (
        <EmptyState title={t('products.empty')} description={t('products.emptyDescription')} action={{ label: t('products.add'), onClick: () => router.push('/app/products') }} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50 text-left"><tr><th className="p-3">{t('products.name')}</th><th className="p-3">{t('products.sku')}</th><th className="p-3 text-right">{t('products.currentStock')}</th><th className="p-3 text-right">{t('products.lowStockThreshold')}</th><th className="p-3">{t('products.status')}</th></tr></thead>
                <tbody>
                  {products.map((product) => {
                    const lowStock = product.status === 'active' && product.current_stock <= product.low_stock_threshold
                    return <tr key={product.id} className="border-b last:border-0"><td className="p-3 font-medium">{product.name}</td><td className="p-3 text-slate-500">{product.sku || '—'}</td><td className={`p-3 text-right font-semibold ${lowStock ? 'text-amber-700' : ''}`}>{product.current_stock}</td><td className="p-3 text-right">{product.low_stock_threshold}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${lowStock ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}>{lowStock ? t('products.lowStock') : t(`products.status.${product.status}`)}</span></td></tr>
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
