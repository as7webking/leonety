'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowUpFromLine, BriefcaseBusiness, Building2, Plus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

const movementTypes = ['stock_in', 'stock_out', 'adjustment', 'return'] as const
type MovementType = typeof movementTypes[number]

interface ProductOption {
  id: string
  name: string
  current_stock: number
}

interface StockMovement {
  id: string
  product_id: string
  type: MovementType
  quantity: number
  reason: string
  reference: string | null
  notes: string | null
  created_at: string
  products?: { name: string } | null
}

const emptyForm = { product_id: '', type: 'stock_in' as MovementType, quantity: '1', reason: '', reference: '', notes: '' }

export default function StockMovementsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [products, setProducts] = useState<ProductOption[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [productResult, movementResult] = await Promise.all([
      supabase.from('products').select('id, name, current_stock').eq('company_id', currentCompany.id).neq('status', 'archived').order('name'),
      supabase.from('stock_movements').select('id, product_id, type, quantity, reason, reference, notes, created_at, products(name)').eq('company_id', currentCompany.id).order('created_at', { ascending: false }).limit(100),
    ])
    const loadError = productResult.error ?? movementResult.error
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setProducts([])
      setMovements([])
    } else {
      setProducts((productResult.data ?? []).map((product) => ({ ...product, current_stock: Number(product.current_stock) })) as ProductOption[])
      setMovements((movementResult.data ?? []).map((movement) => ({ ...movement, quantity: Number(movement.quantity) })) as unknown as StockMovement[])
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => { void loadData() }, [loadData])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')

    const quantity = Number(form.quantity)
    const invalidQuantity = !Number.isFinite(quantity) || (form.type === 'adjustment' ? quantity < 0 : quantity <= 0)
    if (!form.product_id || invalidQuantity || !form.reason.trim()) {
      setError(t('stock.required'))
      return
    }

    const { error: rpcError } = await supabase.rpc('record_stock_movement', {
      p_company_id: currentCompany.id,
      p_product_id: form.product_id,
      p_type: form.type,
      p_quantity: quantity,
      p_reason: form.reason.trim(),
      p_reference: form.reference.trim() || null,
      p_notes: form.notes.trim() || null,
    })

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    await fetch('/api/woocommerce/products/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, productId: form.product_id }),
    }).catch(() => null)

    setMessage(t('stock.created'))
    setForm(emptyForm)
    setShowForm(false)
    await loadData()
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('stock.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('stock.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('stock.title')} description={`${t('stock.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/products"><Button variant="outline">{t('products.title')}</Button></Link>
          <Button onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />{showForm ? t('common.cancel') : t('stock.add')}</Button>
        </div>
      </PageHeader>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t('stock.add')}</CardTitle></CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <EmptyState title={t('stock.noProducts')} description={t('stock.noProductsDescription')} action={{ label: t('products.add'), onClick: () => router.push('/app/products') }} />
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.product')}</span><AppSelect value={form.product_id} onChange={(value) => setForm({ ...form, product_id: value })} options={[{ value: '', label: t('stock.selectProduct'), disabled: true }, ...products.map((product) => ({ value: product.id, label: `${product.name} (${product.current_stock})` }))]} /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.type')}</span><AppSelect value={form.type} onChange={(value) => setForm({ ...form, type: value as MovementType })} options={movementTypes.map((type) => ({ value: type, label: t(`stock.type.${type}`) }))} /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{form.type === 'adjustment' ? t('stock.newStock') : t('stock.quantity')}</span><input type="number" min={form.type === 'adjustment' ? '0' : '0.001'} step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.reason')}</span><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.reference')}</span><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.notes')}</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                <div className="md:col-span-2 xl:col-span-3"><Button type="submit">{t('common.save')}</Button></div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {movements.length === 0 ? (
        <EmptyState title={t('stock.empty')} description={t('stock.emptyDescription')} />
      ) : (
        <div className="space-y-3">
          {movements.map((movement) => {
            const incoming = movement.type === 'stock_in' || movement.type === 'return'
            return (
              <Card key={movement.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-md p-2 ${incoming ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {incoming ? <ArrowDownToLine className="h-5 w-5" /> : <ArrowUpFromLine className="h-5 w-5" />}
                    </div>
                    <div><p className="font-medium">{movement.products?.name ?? t('stock.product')}</p><p className="text-sm text-slate-500">{t(`stock.type.${movement.type}`)} · {movement.reason}</p>{movement.reference && <p className="text-xs text-slate-500">{movement.reference}</p>}</div>
                  </div>
                  <div className="text-right"><p className="font-semibold">{movement.type === 'stock_out' ? '-' : movement.type === 'adjustment' ? '=' : '+'}{movement.quantity}</p><p className="text-xs text-slate-500">{new Date(movement.created_at).toLocaleString()}</p></div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
