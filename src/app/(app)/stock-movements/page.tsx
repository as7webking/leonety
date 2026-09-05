'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowUpFromLine, BriefcaseBusiness, Building2, Plus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

type MovementType = 'stock_in' | 'stock_out' | 'adjustment' | 'return'
type MovementPurpose =
  | 'purchase'
  | 'sale'
  | 'manual_increase'
  | 'manual_decrease'
  | 'return_in'
  | 'return_out'
  | 'adjustment'
  | 'damaged_waste'

const movementPurposes: MovementPurpose[] = [
  'purchase',
  'sale',
  'manual_increase',
  'manual_decrease',
  'return_in',
  'return_out',
  'adjustment',
  'damaged_waste',
]

interface ProductOption {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  current_stock: number
  purchase_price: number | null
  selling_price: number | null
  currency: string
}

interface StockMovement {
  id: string
  product_id: string
  type: MovementType
  quantity: number
  reason: string
  reference: string | null
  notes: string | null
  unit_purchase_cost?: number | null
  selling_price?: number | null
  previous_quantity?: number | null
  resulting_quantity?: number | null
  linked_expense_id?: string | null
  created_at: string
  products?: { name: string } | null
}

const emptyForm = {
  product_id: '',
  purpose: 'purchase' as MovementPurpose,
  quantity: '1',
  reason: '',
  reference: '',
  notes: '',
  unit_purchase_cost: '',
  selling_price: '',
  addExpense: false,
}

function mapPurposeToMovementType(purpose: MovementPurpose): MovementType {
  if (purpose === 'sale' || purpose === 'manual_decrease' || purpose === 'return_out' || purpose === 'damaged_waste') return 'stock_out'
  if (purpose === 'adjustment') return 'adjustment'
  if (purpose === 'return_in') return 'return'
  return 'stock_in'
}

function canCreateExpense(purpose: MovementPurpose) {
  return purpose === 'purchase'
}

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
  const [saving, setSaving] = useState(false)

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === form.product_id) ?? null,
    [form.product_id, products]
  )
  const quantity = Number(form.quantity)
  const unitPurchaseCost = Number(form.unit_purchase_cost)
  const purchaseExpenseAmount = Number.isFinite(quantity) && Number.isFinite(unitPurchaseCost)
    ? Number((quantity * unitPurchaseCost).toFixed(2))
    : 0

  const loadData = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [productResult, movementResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, sku, barcode, current_stock, purchase_price, selling_price, currency')
        .eq('company_id', currentCompany.id)
        .neq('status', 'archived')
        .order('name'),
      supabase
        .from('stock_movements')
        .select('id, product_id, type, quantity, reason, reference, notes, created_at, products(name)')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    const loadError = productResult.error ?? movementResult.error
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setProducts([])
      setMovements([])
    } else {
      setProducts((productResult.data ?? []).map((product) => ({
        ...product,
        current_stock: Number(product.current_stock),
        purchase_price: product.purchase_price === null ? null : Number(product.purchase_price),
        selling_price: product.selling_price === null ? null : Number(product.selling_price),
      })) as ProductOption[])
      setMovements((movementResult.data ?? []).map((movement) => ({
        ...movement,
        quantity: Number(movement.quantity),
      })) as unknown as StockMovement[])
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadData()
    })
    return () => { cancelled = true }
  }, [loadData])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')
    setSaving(true)

    const quantity = Number(form.quantity)
    const movementType = mapPurposeToMovementType(form.purpose)
    const invalidQuantity = !Number.isFinite(quantity) || (movementType === 'adjustment' ? quantity < 0 : quantity <= 0)
    if (!form.product_id || invalidQuantity || !form.reason.trim()) {
      setError(t('stock.required'))
      setSaving(false)
      return
    }

    if (form.addExpense && canCreateExpense(form.purpose)) {
      const unitCost = Number(form.unit_purchase_cost)
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        setError(t('stock.expenseCostRequired'))
        setSaving(false)
        return
      }
    }

    const { data: movementData, error: rpcError } = await supabase.rpc('record_stock_movement', {
      p_company_id: currentCompany.id,
      p_product_id: form.product_id,
      p_type: movementType,
      p_quantity: quantity,
      p_reason: `${t(`stock.purpose.${form.purpose}`)} · ${form.reason.trim()}`,
      p_reference: form.reference.trim() || null,
      p_notes: form.notes.trim() || null,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSaving(false)
      return
    }

    const movementId = Array.isArray(movementData) ? movementData[0]?.id : (movementData as { id?: string } | null)?.id

    if (form.addExpense && canCreateExpense(form.purpose)) {
      const unitCost = Number(form.unit_purchase_cost)
      const product = products.find((item) => item.id === form.product_id)
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          company_id: currentCompany.id,
          amount: Number((quantity * unitCost).toFixed(2)),
          currency: product?.currency ?? currentCompany.currency ?? 'EUR',
          description: `${t('stock.inventoryPurchaseExpense')}: ${product?.name ?? t('stock.product')}`,
          category: t('stock.inventoryPurchaseExpense'),
          date: new Date().toISOString().split('T')[0],
        })
        .select('id')
        .single()

      if (expenseError) {
        setError(expenseError.message)
        setSaving(false)
        return
      }

      if (movementId && expense?.id) {
        await supabase
          .from('stock_movements')
          .update({
            linked_expense_id: expense.id,
            unit_purchase_cost: unitCost,
            selling_price: form.selling_price ? Number(form.selling_price) : selectedProduct?.selling_price ?? null,
          })
          .eq('id', movementId)
          .eq('company_id', currentCompany.id)
          .then(() => null)
      }
    } else if (movementId && (form.unit_purchase_cost || form.selling_price)) {
      await supabase
        .from('stock_movements')
        .update({
          unit_purchase_cost: form.unit_purchase_cost ? Number(form.unit_purchase_cost) : null,
          selling_price: form.selling_price ? Number(form.selling_price) : null,
        })
        .eq('id', movementId)
        .eq('company_id', currentCompany.id)
        .then(() => null)
    }

    await fetch('/api/woocommerce/products/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, productId: form.product_id }),
    }).catch(() => null)

    setMessage(t('stock.created'))
    setForm(emptyForm)
    setShowForm(false)
    setSaving(false)
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
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.product')}</span><AppSelect value={form.product_id} onChange={(value) => {
                  const product = products.find((item) => item.id === value)
                  setForm({
                    ...form,
                    product_id: value,
                    unit_purchase_cost: product?.purchase_price === null || product?.purchase_price === undefined ? form.unit_purchase_cost : String(product.purchase_price),
                    selling_price: product?.selling_price === null || product?.selling_price === undefined ? form.selling_price : String(product.selling_price),
                  })
                }} options={[{ value: '', label: t('stock.selectProduct'), disabled: true }, ...products.map((product) => ({ value: product.id, label: `${product.name} (${product.current_stock})` }))]} /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.type')}</span><AppSelect value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value as MovementPurpose, addExpense: canCreateExpense(value as MovementPurpose) ? form.addExpense : false })} options={movementPurposes.map((purpose) => ({ value: purpose, label: t(`stock.purpose.${purpose}`) }))} /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{mapPurposeToMovementType(form.purpose) === 'adjustment' ? t('stock.newStock') : t('stock.quantity')}</span><input type="number" min={mapPurposeToMovementType(form.purpose) === 'adjustment' ? '0' : '0.001'} step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.unitPurchaseCost')}</span><input type="number" min="0" step="0.01" value={form.unit_purchase_cost} onChange={(e) => setForm({ ...form, unit_purchase_cost: e.target.value })} className="w-full rounded-md border px-3 py-2" inputMode="decimal" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.sellingPrice')}</span><input type="number" min="0" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="w-full rounded-md border px-3 py-2" inputMode="decimal" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.reason')}</span><input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.reference')}</span><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                <label className="space-y-1"><span className="text-sm font-medium">{t('stock.notes')}</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-2 xl:col-span-3">
                  <label className={`flex items-start gap-2 text-sm ${canCreateExpense(form.purpose) ? 'text-slate-700' : 'text-slate-400'}`}>
                    <input
                      type="checkbox"
                      checked={form.addExpense}
                      disabled={!canCreateExpense(form.purpose)}
                      onChange={(event) => setForm({ ...form, addExpense: event.target.checked })}
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block font-medium">{t('stock.addPurchaseToExpenses')}</span>
                      <span className="block text-xs">{t('stock.addPurchaseToExpensesHint')}</span>
                    </span>
                  </label>
                  {form.addExpense && (
                    <p className="text-sm text-slate-600">{t('stock.expensePreview')}: {purchaseExpenseAmount.toFixed(2)} {selectedProduct?.currency ?? currentCompany.currency ?? 'EUR'}</p>
                  )}
                </div>
                <div className="md:col-span-2 xl:col-span-3"><Button type="submit" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button></div>
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
                    <div>
                      <p className="font-medium">{movement.products?.name ?? t('stock.product')}</p>
                      <p className="text-sm text-slate-500">{t(`stock.type.${movement.type}`)} · {movement.reason}</p>
                      {movement.reference && <p className="text-xs text-slate-500">{movement.reference}</p>}
                      {(movement.unit_purchase_cost || movement.selling_price) && (
                        <p className="text-xs text-slate-500">
                          {movement.unit_purchase_cost ? `${t('stock.unitPurchaseCost')}: ${movement.unit_purchase_cost}` : ''}
                          {movement.unit_purchase_cost && movement.selling_price ? ' · ' : ''}
                          {movement.selling_price ? `${t('stock.sellingPrice')}: ${movement.selling_price}` : ''}
                        </p>
                      )}
                      {movement.previous_quantity !== null && movement.previous_quantity !== undefined && movement.resulting_quantity !== null && movement.resulting_quantity !== undefined && (
                        <p className="text-xs text-slate-500">{t('stock.quantityChange')}: {movement.previous_quantity} → {movement.resulting_quantity}</p>
                      )}
                      {movement.linked_expense_id && <p className="text-xs text-slate-500">{t('stock.linkedExpense')}</p>}
                    </div>
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
