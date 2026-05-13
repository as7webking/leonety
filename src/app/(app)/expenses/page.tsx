'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader, EmptyState, LoadingSkeleton } from "@/components"
import { Building2, Edit, Trash2 } from "lucide-react"
import { createClient } from '@/lib/supabase-client'
import { expenseSchema, formatValidationError, type ExpenseForm } from '@/lib/validations'
import { useCompany } from '@/contexts/company-context'
import { buildCsv, parseCsv } from '@/lib/csv'
import { convertToCurrency, currencyOptions, formatCurrency, isSupportedCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { fetchLatestExchangeRate } from '@/lib/exchange-rates-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Expense extends ExpenseForm {
  id: string
  company_id: string
}

export default function ExpensesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Expense | null>(null)
  const [formData, setFormData] = useState<ExpenseForm>({
    amount: 0,
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'USD',
  })
  const [customCategory, setCustomCategory] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [importing, setImporting] = useState(false)
  const [latestRate, setLatestRate] = useState<number | null>(null)
  const [latestRateLoading, setLatestRateLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const categoryOptions = ['Food', 'Utilities', 'Rent', 'Other']

  const loadExpenses = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('date', { ascending: false })

      if (error) throw error
      setExpenses((data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })))
    } catch (error) {
      console.error('Failed to load expenses:', error)
      setErrorMessage('Failed to load expense data')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  useEffect(() => {
    const loadLatestRate = async () => {
      if (!currentCompany) return

      const fromCurrency = normalizeCurrencyCode(formData.currency)
      const toCurrency = normalizeCurrencyCode(currentCompany.currency ?? 'USD')

      if (fromCurrency === toCurrency) {
        setLatestRate(1)
        return
      }

      try {
        setLatestRateLoading(true)
        const data = await fetchLatestExchangeRate(fromCurrency, toCurrency)
        setLatestRate(data.rate)
      } catch (error) {
        console.error('Failed to load latest expense exchange rate:', error)
        setLatestRate(null)
      } finally {
        setLatestRateLoading(false)
      }
    }

    void loadLatestRate()
  }, [currentCompany, formData.currency])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage('Create a workspace first')
      return
    }

    try {
      const validatedData = expenseSchema.parse(formData)
      const category = validatedData.category === 'Other' ? customCategory || 'Other' : validatedData.category
      const payload = {
        description: validatedData.description,
        date: validatedData.date,
        category,
        amount: Number(validatedData.amount.toFixed(2)),
        currency: validatedData.currency,
        company_id: currentCompany.id,
      }

      if (editingEntry) {
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', editingEntry.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error
        setSuccessMessage('Expense updated successfully!')
      } else {
        const { error } = await supabase.from('expenses').insert(payload)
        if (error) throw error
        setSuccessMessage('Expense added successfully!')
      }

      setFormData({
        amount: 0,
        description: '',
        category: '',
        currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD'),
        date: new Date().toISOString().split('T')[0],
      })
      setCustomCategory('')
      setShowForm(false)
      setEditingEntry(null)
      loadExpenses()
      window.setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Expense submit error:', formatValidationError(error))
      setErrorMessage(formatValidationError(error))
      window.setTimeout(() => setErrorMessage(''), 5000)
    }
  }

  const handleEdit = (entry: Expense) => {
    setEditingEntry(entry)
    setFormData({
      amount: entry.amount,
      description: entry.description,
      category: entry.category,
      date: entry.date,
      currency: normalizeCurrencyCode(entry.currency),
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!currentCompany || !confirm('Delete this expense entry?')) return

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('company_id', currentCompany.id)
      if (error) throw error
      loadExpenses()
      setSuccessMessage('Expense deleted')
      window.setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete expense')
      window.setTimeout(() => setErrorMessage(''), 5000)
    }
  }

  const handleExportCSV = () => {
    if (expenses.length === 0) {
      setErrorMessage('No data to export')
      window.setTimeout(() => setErrorMessage(''), 3000)
      return
    }

    const headers = ['Date', 'Description', 'Category', 'Amount', 'Currency']
    const rows = expenses.map((expense) => [expense.date, expense.description, expense.category, expense.amount, expense.currency])
    const csv = buildCsv([headers, ...rows])
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `expenses-${new Date().toISOString().split('T')[0]}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentCompany) return

    setImporting(true)
    setSuccessMessage('')
    setErrorMessage('')

    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row')
      }

      const header = rows[0].map((value) => value.trim().toLowerCase())
      const dateIndex = header.indexOf('date')
      const descriptionIndex = header.indexOf('description')
      const categoryIndex = header.indexOf('category')
      const amountIndex = header.indexOf('amount')
      const currencyIndex = header.indexOf('currency')

      if ([dateIndex, descriptionIndex, categoryIndex, amountIndex, currencyIndex].some((index) => index === -1)) {
        throw new Error('CSV must include Date, Description, Category, Amount, and Currency columns')
      }

      const payload = rows.slice(1).map((columns, index) => {
        const date = columns[dateIndex]
        const description = columns[descriptionIndex]?.trim()
        const category = columns[categoryIndex]?.trim()
        const amount = Number(columns[amountIndex])
        const currency = normalizeCurrencyCode(columns[currencyIndex] || currentCompany.currency || 'USD')

        if (!date || Number.isNaN(new Date(date).getTime())) {
          throw new Error(`Row ${index + 2}: invalid date`)
        }

        if (!description) {
          throw new Error(`Row ${index + 2}: description is required`)
        }

        if (!category) {
          throw new Error(`Row ${index + 2}: category is required`)
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(`Row ${index + 2}: amount must be greater than 0`)
        }

        if (!isSupportedCurrency(currency)) {
          throw new Error(`Row ${index + 2}: unsupported currency`)
        }

        return {
          company_id: currentCompany.id,
          date,
          description,
          category,
          amount: Number(amount.toFixed(2)),
          currency,
        }
      })

      const { error } = await supabase.from('expenses').insert(payload)
      if (error) throw error

      setSuccessMessage(`Imported ${payload.length} expense entr${payload.length === 1 ? 'y' : 'ies'}`)
      await loadExpenses()
    } catch (error) {
      console.error('Expense CSV import failed:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import CSV')
    } finally {
      setImporting(false)
      event.target.value = ''
      window.setTimeout(() => {
        setSuccessMessage('')
        setErrorMessage('')
      }, 4000)
    }
  }

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title="Expenses" description="Track your expenses" />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title="Expenses" description="Track your expenses" />
        <EmptyState
          icon={Building2}
          title="No workspace selected"
          description="Create your first workspace before adding expenses."
          action={{ label: 'Go to onboarding', onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title="Expenses" description={`Track expenses for ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} size="sm" disabled={importing}>
            {importing ? 'Importing...' : 'Import CSV'}
          </Button>
          {expenses.length > 0 && <Button variant="outline" onClick={handleExportCSV} size="sm">Export CSV</Button>}
          <Button onClick={() => { setShowForm(!showForm); setEditingEntry(null) }}>
            {showForm ? 'Cancel' : 'Add Expense'}
          </Button>
        </div>
      </PageHeader>

      {successMessage && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{successMessage}</div>}
      {errorMessage && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingEntry ? 'Edit Expense' : 'Add Expense'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Amount</label>
                <input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })} className="w-full rounded-md border px-3 py-2" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full rounded-md border px-3 py-2" required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full rounded-md border px-3 py-2" required>
                  <option value="">Select category</option>
                  {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
                {formData.category === 'Other' && (
                  <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="mt-2 w-full rounded-md border px-3 py-2" placeholder="Custom category" required />
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">Date</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full rounded-md border px-3 py-2" required />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: normalizeCurrencyCode(e.target.value) })}
                    className="w-full rounded-md border px-3 py-2"
                    required
                  >
                    {currencyOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} - {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit">{editingEntry ? 'Save Changes' : 'Save Expense'}</Button>
              <p className="text-sm text-slate-500">
                {latestRateLoading
                  ? 'Loading latest exchange rate...'
                  : `Latest rate: 1 ${normalizeCurrencyCode(formData.currency)} = ${(latestRate ?? 1).toFixed(4)} ${normalizeCurrencyCode(currentCompany.currency ?? 'USD')}`}
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {expenses.length === 0 ? (
        <EmptyState title="No expense entries yet" description="Add your first expense entry for this workspace." />
      ) : (
        <div className="space-y-4">
          {expenses.map((expense) => (
            <Card key={expense.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{expense.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {expense.category} · {expense.date}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-normal">
                      {formatCurrency(
                        convertToCurrency(
                          Number(expense.amount),
                          expense.currency,
                          normalizeCurrencyCode(currentCompany.currency ?? 'USD')
                        ),
                        normalizeCurrencyCode(currentCompany.currency ?? 'USD')
                      )}
                    </p>
                    {normalizeCurrencyCode(expense.currency) !== normalizeCurrencyCode(currentCompany.currency ?? 'USD') && (
                      <p className="text-sm text-slate-500">
                        {formatCurrency(Number(expense.amount), expense.currency)}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => handleEdit(expense)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(expense.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
