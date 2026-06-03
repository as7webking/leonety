'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, Building2, Printer, Plus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCategoryLabel } from '@/lib/category-labels'
import { loadCompanyBranding } from '@/lib/company-branding'
import { currencyOptions, formatCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { createClient } from '@/lib/supabase-client'

interface TransactionRow {
  id: string
  type: 'income' | 'expense'
  date: string
  description: string | null
  category: string | null
  amount: number
  currency: string
}

interface SupabaseTransactionRow {
  id: string
  date: string
  description: string | null
  category: string | null
  amount: number | string
  currency: string
}

type BulkRenameTarget = 'all' | 'income' | 'expense'
type BulkRenameField = 'description' | 'category'

export default function TransactionsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBulkRename, setShowBulkRename] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [printFromDate, setPrintFromDate] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [printToDate, setPrintToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    amount: 0,
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    currency: 'USD',
  })
  const [bulkRename, setBulkRename] = useState({
    target: 'income' as BulkRenameTarget,
    field: 'description' as BulkRenameField,
    from: '',
    to: '',
  })
  const [selectedBulkRenameIds, setSelectedBulkRenameIds] = useState<string[]>([])

  const loadTransactions = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const [incomeRes, expenseRes] = await Promise.all([
        supabase
          .from('incomes')
          .select('id, date, description, category, amount, currency')
          .eq('company_id', currentCompany.id)
          .order('date', { ascending: false }),
        supabase
          .from('expenses')
          .select('id, date, description, category, amount, currency')
          .eq('company_id', currentCompany.id)
          .order('date', { ascending: false }),
      ])

      if (incomeRes.error) throw incomeRes.error
      if (expenseRes.error) throw expenseRes.error

      const nextTransactions: TransactionRow[] = [
        ...((incomeRes.data ?? []) as SupabaseTransactionRow[]).map((item) => ({
          ...item,
          type: 'income' as const,
          amount: Number(item.amount),
        })),
        ...((expenseRes.data ?? []) as SupabaseTransactionRow[]).map((item) => ({
          ...item,
          type: 'expense' as const,
          amount: Number(item.amount),
        })),
      ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())

      setTransactions(nextTransactions)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    if (!currentCompany) return
    const branding = loadCompanyBranding(currentCompany.id)
    setCompanyLogo(branding.logo)
    setCompanyAddress(branding.address)
  }, [currentCompany])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage('Create or select a workspace first.')
      return
    }

    if (!formData.description.trim()) {
      setErrorMessage('Description is required.')
      return
    }

    if (!Number.isFinite(formData.amount) || formData.amount <= 0) {
      setErrorMessage('Amount must be greater than 0.')
      return
    }

    const table = formData.type === 'income' ? 'incomes' : 'expenses'
    const { error } = await supabase.from(table).insert({
      company_id: currentCompany.id,
      amount: Number(formData.amount.toFixed(2)),
      description: formData.description.trim(),
      category: formData.category.trim() || 'Other',
      date: formData.date,
      currency: normalizeCurrencyCode(formData.currency),
    })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setMessage('Transaction created.')
    setShowForm(false)
    setFormData({
      type: 'income',
      amount: 0,
      description: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD'),
    })
    await loadTransactions()
  }

  const handleBulkRename = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage('Create or select a workspace first.')
      return
    }

    const fromValue = bulkRename.from.trim()
    const toValue = bulkRename.to.trim()

    if (!fromValue || !toValue) {
      setErrorMessage(t('transactions.bulkRenameRequired'))
      return
    }

    const selectedMatches = bulkRenameMatches.filter((transaction) =>
      selectedBulkRenameIds.includes(`${transaction.type}:${transaction.id}`)
    )

    if (selectedMatches.length === 0) {
      setErrorMessage(t('transactions.bulkRenameSelectRequired'))
      return
    }

    const tables = [
      {
        table: 'incomes',
        ids: selectedMatches.filter((transaction) => transaction.type === 'income').map((transaction) => transaction.id),
      },
      {
        table: 'expenses',
        ids: selectedMatches.filter((transaction) => transaction.type === 'expense').map((transaction) => transaction.id),
      },
    ]
    let updatedCount = 0

    for (const { table, ids } of tables) {
      if (ids.length === 0) continue

      const { error } = await supabase
        .from(table)
        .update({ [bulkRename.field]: toValue })
        .eq('company_id', currentCompany.id)
        .in('id', ids)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      updatedCount += ids.length
    }

    setMessage(t('transactions.bulkRenameDone').replace('{count}', String(updatedCount)))
    setBulkRename((prev) => ({ ...prev, from: '', to: '' }))
    setSelectedBulkRenameIds([])
    await loadTransactions()
  }

  const handlePrint = () => {
    const previousTitle = document.title
    document.title = ' '
    window.print()
    window.setTimeout(() => {
      document.title = previousTitle
    }, 500)
  }

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((left, right) => {
      const leftValue = sortBy === 'date' ? new Date(left.date).getTime() : left.amount
      const rightValue = sortBy === 'date' ? new Date(right.date).getTime() : right.amount
      return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
    })
  }, [transactions, sortBy, sortDirection])

  const bulkRenameMatches = useMemo(() => {
    const fromValue = bulkRename.from.trim()
    if (!fromValue) return []

    return transactions.filter((transaction) => {
      const matchesTarget = bulkRename.target === 'all' || transaction.type === bulkRename.target
      const fieldValue = transaction[bulkRename.field] ?? ''
      const translatedValue = bulkRename.field === 'category' ? formatCategoryLabel(transaction.category, t) : fieldValue
      return matchesTarget && (fieldValue === fromValue || translatedValue === fromValue)
    })
  }, [bulkRename.field, bulkRename.from, bulkRename.target, transactions, t])

  useEffect(() => {
    setSelectedBulkRenameIds(bulkRenameMatches.map((transaction) => `${transaction.type}:${transaction.id}`))
  }, [bulkRenameMatches])

  const printableTransactions = useMemo(() => {
    return sortedTransactions.filter((transaction) => {
      const afterStart = !printFromDate || transaction.date >= printFromDate
      const beforeEnd = !printToDate || transaction.date <= printToDate
      return afterStart && beforeEnd
    })
  }, [printFromDate, printToDate, sortedTransactions])

  const printColumns = useMemo(() => {
    const incomes = printableTransactions.filter((transaction) => transaction.type === 'income')
    const expenses = printableTransactions.filter((transaction) => transaction.type === 'expense')
    const rowCount = Math.max(incomes.length, expenses.length)

    return { incomes, expenses, rowCount }
  }, [printableTransactions])

  const formatTotalsByCurrency = (items: TransactionRow[]) => {
    const totals = getTotalsByCurrency(items)
    const totalText = Object.entries(totals)
      .map(([currency, amount]) => formatCurrency(amount, currency))
      .join(' · ')

    return totalText || formatCurrency(0, normalizeCurrencyCode(currentCompany?.currency ?? 'USD'))
  }

  const getTotalsByCurrency = (items: TransactionRow[]) =>
    items.reduce<Record<string, number>>((acc, transaction) => {
      const currency = normalizeCurrencyCode(transaction.currency)
      acc[currency] = (acc[currency] ?? 0) + transaction.amount
      return acc
    }, {})

  const formatNetTotals = () => {
    const incomeTotals = getTotalsByCurrency(printColumns.incomes)
    const expenseTotals = getTotalsByCurrency(printColumns.expenses)
    const currencies = Array.from(new Set([...Object.keys(incomeTotals), ...Object.keys(expenseTotals)]))

    if (currencies.length === 0) {
      return formatCurrency(0, normalizeCurrencyCode(currentCompany?.currency ?? 'USD'))
    }

    return currencies
      .map((currency) => formatCurrency((incomeTotals[currency] ?? 0) - (expenseTotals[currency] ?? 0), currency))
      .join(' · ')
  }

  const renderPrintCell = (transaction: TransactionRow | undefined) => {
    if (!transaction) return null
    const categoryLabel = formatCategoryLabel(transaction.category, t)
    const isDefaultBusinessIncome =
      currentCompany?.type === 'business' &&
      transaction.type === 'income' &&
      (!transaction.description ||
        transaction.description === transaction.category ||
        transaction.description === categoryLabel)

    return (
      <div className="break-inside-avoid space-y-1">
        <div className="flex justify-between gap-3">
          <span className="font-medium">
            {isDefaultBusinessIncome
              ? new Date(`${transaction.date}T00:00:00`).toLocaleDateString(locale)
              : transaction.description || transaction.date}
          </span>
          <span className="whitespace-nowrap font-semibold">
            {formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency))}
          </span>
        </div>
        {!isDefaultBusinessIncome && (
          <div className="text-xs text-slate-600">
            {new Date(`${transaction.date}T00:00:00`).toLocaleDateString(locale)}
            {transaction.type === 'expense' && transaction.category ? ` · ${categoryLabel}` : ''}
          </div>
        )}
      </div>
    )
  }

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title={t('transactions.title')} description={t('transactions.description')} />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('transactions.title')} description={t('transactions.description')} />
        <EmptyState
          icon={Building2}
          title={t('common.noWorkspaceSelected')}
          description={t('dashboard.noWorkspace')}
          action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('transactions.title')} description={`${t('transactions.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>{t('transactions.printFrom')}</span>
            <input
              type="date"
              value={printFromDate}
              onChange={(event) => setPrintFromDate(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span>{t('transactions.printTo')}</span>
            <input
              type="date"
              value={printToDate}
              onChange={(event) => setPrintToDate(event.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </label>
          <AppSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as 'date' | 'amount')}
            options={[
              { value: 'date', label: t('common.sortDate') },
              { value: 'amount', label: t('common.sortAmount') },
            ]}
            ariaLabel={t('common.sortBy')}
            className="w-36"
          />
          <AppSelect
            value={sortDirection}
            onChange={(value) => setSortDirection(value as 'asc' | 'desc')}
            options={[
              { value: 'desc', label: t('common.descending') },
              { value: 'asc', label: t('common.ascending') },
            ]}
            ariaLabel={t('common.sortDirection')}
            className="w-40"
          />
          <Button type="button" variant="outline" onClick={handlePrint} disabled={printableTransactions.length === 0}>
            <Printer className="h-4 w-4" />
            {t('common.print')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowBulkRename((value) => !value)}>
            {showBulkRename ? t('common.cancel') : t('transactions.bulkRename')}
          </Button>
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            <Plus className="h-4 w-4" />
            {showForm ? t('common.cancel') : t('transactions.add')}
          </Button>
        </div>
      </PageHeader>

      <div className="print-area print-compact hidden">
        <div className="mb-2 flex items-start gap-3">
          {companyLogo ? (
            <img src={companyLogo} alt={currentCompany.name} className="h-12 w-12 object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
              {currentCompany.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{currentCompany.name}</h1>
            <p className="text-sm text-slate-600">
              {t('transactions.title')} · {printFromDate || '...'} - {printToDate || '...'}
            </p>
            {companyAddress && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddress}</p>}
          </div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-1/2 border p-2 text-left">{t('income.title')}</th>
              <th className="w-1/2 border p-2 text-left">{t('expenses.title')}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: printColumns.rowCount }).map((_, index) => {
              const income = printColumns.incomes[index]
              const expense = printColumns.expenses[index]

              return (
                <tr key={`print-row-${index}`}>
                  <td className="border p-2 align-top">{renderPrintCell(income)}</td>
                  <td className="border p-2 align-top">{renderPrintCell(expense)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="mt-2 space-y-1 border-t pt-2 text-right text-sm font-semibold">
          <p>{t('income.title')}: {formatTotalsByCurrency(printColumns.incomes)}</p>
          <p>{t('expenses.title')}: {formatTotalsByCurrency(printColumns.expenses)}</p>
          <p className="text-base">{t('dashboard.netIncome')}: {formatNetTotals()}</p>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>
      )}

      {showBulkRename && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('transactions.bulkRename')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleBulkRename} className="grid gap-4 md:grid-cols-5">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.bulkTarget')}</span>
                <AppSelect
                  value={bulkRename.target}
                  onChange={(value) => setBulkRename({ ...bulkRename, target: value as BulkRenameTarget })}
                  options={[
                    { value: 'income', label: t('income.title') },
                    { value: 'expense', label: t('expenses.title') },
                    { value: 'all', label: t('transactions.all') },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.bulkField')}</span>
                <AppSelect
                  value={bulkRename.field}
                  onChange={(value) => setBulkRename({ ...bulkRename, field: value as BulkRenameField })}
                  options={[
                    { value: 'description', label: t('common.description') },
                    { value: 'category', label: t('common.category') },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.bulkOldValue')}</span>
                <input
                  value={bulkRename.from}
                  onChange={(event) => setBulkRename({ ...bulkRename, from: event.target.value })}
                  className="w-full rounded-md border px-3 py-2"
                  placeholder="Verkauf"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.bulkNewValue')}</span>
                <input
                  value={bulkRename.to}
                  onChange={(event) => setBulkRename({ ...bulkRename, to: event.target.value })}
                  className="w-full rounded-md border px-3 py-2"
                  placeholder="eingenommen"
                  required
                />
              </label>
              <div className="flex items-end">
                <Button type="submit" className="w-full">{t('transactions.bulkApply')}</Button>
              </div>
              <p className="text-xs text-slate-500 md:col-span-5">
                {t('transactions.bulkHint')}
              </p>
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:col-span-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t('transactions.bulkMatches').replace('{count}', String(bulkRenameMatches.length))}
                  </p>
                  {bulkRenameMatches.length > 0 && (
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedBulkRenameIds.length === bulkRenameMatches.length}
                        onChange={(event) => {
                          setSelectedBulkRenameIds(event.target.checked
                            ? bulkRenameMatches.map((transaction) => `${transaction.type}:${transaction.id}`)
                            : []
                          )
                        }}
                        className="h-4 w-4"
                      />
                      {t('transactions.bulkSelectAll')}
                    </label>
                  )}
                </div>
                {bulkRenameMatches.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('transactions.bulkNoMatches')}</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {bulkRenameMatches.map((transaction) => {
                      const rowId = `${transaction.type}:${transaction.id}`
                      return (
                        <label key={rowId} className="flex items-start gap-2 rounded-md bg-white p-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedBulkRenameIds.includes(rowId)}
                            onChange={(event) => {
                              setSelectedBulkRenameIds((prev) => event.target.checked
                                ? [...prev, rowId]
                                : prev.filter((id) => id !== rowId)
                              )
                            }}
                            className="mt-1 h-4 w-4"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900">
                              {transaction.type === 'income' ? t('income.title') : t('expenses.title')} · {transaction.date}
                            </span>
                            <span className="block truncate text-slate-600">
                              {transaction.description || '-'} · {formatCategoryLabel(transaction.category, t)} · {formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency))}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('transactions.add')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.type')}</span>
                <AppSelect
                  value={formData.type}
                  onChange={(value) => setFormData({ ...formData, type: value as 'income' | 'expense' })}
                  options={[
                    { value: 'income', label: t('income.title') },
                    { value: 'expense', label: t('expenses.title') },
                  ]}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('common.amount')}</span>
                <input type="number" min="0" step="0.01" value={formData.amount} onChange={(event) => setFormData({ ...formData, amount: Number(event.target.value) })} className="w-full rounded-md border px-3 py-2" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('common.currency')}</span>
                <AppSelect
                  value={formData.currency}
                  onChange={(value) => setFormData({ ...formData, currency: normalizeCurrencyCode(value) })}
                  options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('common.date')}</span>
                <input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('common.category')}</span>
                <input value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })} className="w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 md:col-span-3">
                <span className="text-sm font-medium">{t('common.description')}</span>
                <input value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
              </label>
              <div className="md:col-span-3">
                <Button type="submit">{t('transactions.save')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {transactions.length === 0 ? (
        <EmptyState title={t('common.noTransactions')} description={t('transactions.emptyDescription')} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 border-b bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 md:grid-cols-[auto_1fr_160px_160px]">
            <span>{t('transactions.type')}</span>
            <span>{t('common.description')}</span>
            <span className="hidden md:block">{t('common.category')}</span>
            <span className="text-right">{t('common.amount')}</span>
          </div>
          {sortedTransactions.map((transaction) => {
            const isIncome = transaction.type === 'income'
            const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle

            return (
              <div
                key={`${transaction.type}-${transaction.id}`}
                className="grid grid-cols-[auto_1fr_auto] gap-3 border-b px-4 py-3 text-sm last:border-b-0 md:grid-cols-[auto_1fr_160px_160px]"
              >
                <span className={`inline-flex items-center gap-1 font-medium ${isIncome ? 'text-emerald-700' : 'text-red-700'}`}>
                  <Icon className="h-4 w-4" />
                  {isIncome ? t('income.title') : t('expenses.title')}
                </span>
                <span>
                  <span className="block font-medium text-slate-900">{transaction.description || '-'}</span>
                  <span className="text-xs text-slate-500">{transaction.date}</span>
                </span>
                <span className="hidden text-slate-600 md:block">{formatCategoryLabel(transaction.category, t)}</span>
                <span className="text-right font-semibold">
                  {formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
