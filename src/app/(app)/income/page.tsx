'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader, EmptyState, LoadingSkeleton } from "@/components"
import { Building2, Edit, Trash2 } from "lucide-react"
import { createClient } from '@/lib/supabase-client'
import { formatValidationError, incomeSchema, type IncomeForm } from '@/lib/validations'
import { useCompany } from '@/contexts/company-context'
import { buildCsv, parseCsv } from '@/lib/csv'
import { formatCategoryLabel } from '@/lib/category-labels'
import { loadCompanyBranding } from '@/lib/company-branding'
import { convertToCurrency, currencyOptions, formatCurrency, isSupportedCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { fetchLatestExchangeRate } from '@/lib/exchange-rates-client'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AppSelect } from '@/components/app-select'
import { getIntlLocale } from '@/lib/i18n'
import { getCsvColumnIndex, normalizeCsvHeader, parseLocalizedAmount, parseTransactionDate, validateSignedAmountInput } from '@/lib/transaction-utils'

interface Income extends IncomeForm {
  id: string
  company_id: string
}

type IncomeFormState = Omit<IncomeForm, 'amount'> & { amount: string }

export default function IncomePage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const intlLocale = getIntlLocale(locale)
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Income | null>(null)
  const [formData, setFormData] = useState<IncomeFormState>({
    amount: '',
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
  const [groupReportsByMonth, setGroupReportsByMonth] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterFromDate, setFilterFromDate] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [filterToDate, setFilterToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isBusinessWorkspace = currentCompany?.type === 'business'
  const categoryOptions = currentCompany?.type === 'business'
    ? ['Sales', 'Service', 'Invoice Payment', 'Salary', 'Other']
    : ['Salary', 'Freelance', 'Investment', 'Other']

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGroupReportsByMonth(window.localStorage.getItem('leonety-group-reports-by-month') === 'true')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!currentCompany) return
    const branding = loadCompanyBranding(currentCompany.id)
    setCompanyLogo(branding.logo)
    setCompanyAddress(branding.address)
  }, [currentCompany])

  const loadIncomes = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const { data, error } = await supabase
        .from('incomes')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('date', { ascending: false })

      if (error) throw error
      setIncomes((data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })))
    } catch (error) {
      console.error('Failed to load incomes:', error)
      setErrorMessage('Failed to load income data')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    loadIncomes()
  }, [loadIncomes])

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
        console.error('Failed to load latest income exchange rate:', error)
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
      const effectiveCategory = isBusinessWorkspace ? (formData.category || 'Sales') : formData.category
      const fallbackDescription = effectiveCategory && effectiveCategory !== 'Other'
        ? formatCategoryLabel(effectiveCategory, t)
        : formData.description
      const parsedAmount = validateSignedAmountInput(formData.amount, {
        required: t('transactions.amountRequired'),
        invalid: t('transactions.amountInvalid'),
        nonZero: t('transactions.amountNonZero'),
      })
      const validatedData = incomeSchema.parse({
        ...formData,
        amount: parsedAmount,
        category: effectiveCategory,
        currency: isBusinessWorkspace ? normalizeCurrencyCode(currentCompany.currency ?? 'USD') : formData.currency,
        description: fallbackDescription,
      })
      const category = validatedData.category === 'Other' ? customCategory || 'Other' : validatedData.category
      const payload = {
        description: validatedData.description,
        date: validatedData.date,
        category,
        amount: validatedData.amount,
        currency: validatedData.currency,
        company_id: currentCompany.id,
      }

      if (editingEntry) {
        const { error } = await supabase
          .from('incomes')
          .update(payload)
          .eq('id', editingEntry.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error
        setSuccessMessage(t('income.updated'))
      } else {
        const { error } = await supabase.from('incomes').insert(payload)
        if (error) throw error
        setSuccessMessage(t('income.created'))
      }

      setFormData({
        amount: '',
        description: '',
        category: '',
        currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD'),
        date: new Date().toISOString().split('T')[0],
      })
      setCustomCategory('')
      setShowForm(false)
      setEditingEntry(null)
      loadIncomes()
      window.setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      console.error('Income submit error:', formatValidationError(error))
      setErrorMessage(formatValidationError(error))
      window.setTimeout(() => setErrorMessage(''), 5000)
    }
  }

  const handleEdit = (entry: Income) => {
    setEditingEntry(entry)
    setFormData({
      amount: String(entry.amount),
      description: entry.description,
      category: entry.category,
      date: entry.date,
      currency: normalizeCurrencyCode(entry.currency),
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!currentCompany) return

    try {
      const { error } = await supabase.from('incomes').delete().eq('id', id).eq('company_id', currentCompany.id)
      if (error) throw error
      loadIncomes()
      setSuccessMessage(t('income.deleted'))
      window.setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete income')
      window.setTimeout(() => setErrorMessage(''), 5000)
    }
  }

  const handleExportCSV = () => {
    if (sortedIncomes.length === 0) {
      setErrorMessage(t('time.noDataExport'))
      window.setTimeout(() => setErrorMessage(''), 3000)
      return
    }

    const headers = [t('common.date'), t('common.description'), t('common.category'), t('common.amount'), t('common.currency')]
    const rows = sortedIncomes.map((income) => [income.date, income.description, formatCategoryLabel(income.category, t), income.amount, income.currency])
    const csv = buildCsv([headers, ...rows])
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `incomes-${new Date().toISOString().split('T')[0]}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const getWorkspaceAmount = (income: Income) =>
    convertToCurrency(
      Number(income.amount),
      income.currency,
      normalizeCurrencyCode(currentCompany?.currency ?? 'USD')
    )

  const sortedIncomes = useMemo(() => {
    return incomes.filter((income) => {
      const afterStart = !filterFromDate || income.date >= filterFromDate
      const beforeEnd = !filterToDate || income.date <= filterToDate
      return afterStart && beforeEnd
    }).sort((left, right) => {
      const leftValue = sortBy === 'date' ? new Date(left.date).getTime() : Number(left.amount)
      const rightValue = sortBy === 'date' ? new Date(right.date).getTime() : Number(right.amount)
      return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
    })
  }, [filterFromDate, filterToDate, incomes, sortBy, sortDirection])

  const groupedIncomes = sortedIncomes.reduce<Record<string, Income[]>>((groups, income) => {
    const key = income.date.slice(0, 7)
    return {
      ...groups,
      [key]: [...(groups[key] ?? []), income],
    }
  }, {})

  const displayGroups = groupReportsByMonth ? Object.entries(groupedIncomes).sort(([left], [right]) => sortDirection === 'asc' ? left.localeCompare(right) : right.localeCompare(left)) : [['all', sortedIncomes] as const]
  const printGroups = displayGroups
  const formatMonthLabel = (monthKey: string) => {
    if (monthKey === 'all') return ''
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })
  }

  const renderPrintAmount = (income: Income) => {
    const originalAmount = `${Number(income.amount).toFixed(2)} ${income.currency}`
    const workspaceCurrency = normalizeCurrencyCode(currentCompany?.currency ?? 'USD')
    const convertedAmount = formatCurrency(getWorkspaceAmount(income), workspaceCurrency, intlLocale)

    if (normalizeCurrencyCode(income.currency) === workspaceCurrency) {
      return originalAmount
    }

    return `${originalAmount} (${convertedAmount})`
  }

  const handlePrint = () => {
    if (sortedIncomes.length === 0) {
      setErrorMessage(t('time.noDataPrint'))
      window.setTimeout(() => setErrorMessage(''), 3000)
      return
    }

    const previousTitle = document.title
    document.title = ' '
    window.print()
    window.setTimeout(() => {
      document.title = previousTitle
    }, 500)
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

      const header = rows[0].map(normalizeCsvHeader)
      const dateIndex = getCsvColumnIndex(header, ['date'])
      const descriptionIndex = getCsvColumnIndex(header, ['description', 'name', 'title'])
      const categoryIndex = getCsvColumnIndex(header, ['category'])
      const amountIndex = getCsvColumnIndex(header, ['amount'])
      const currencyIndex = getCsvColumnIndex(header, ['currency'])

      if ([dateIndex, descriptionIndex, categoryIndex, amountIndex, currencyIndex].some((index) => index === -1)) {
        throw new Error(t('transactions.importMissingColumns'))
      }

      const payload = rows.slice(1).map((columns, index) => {
        const rowNumber = index + 2
        const date = parseTransactionDate(columns[dateIndex] ?? '')
        const description = columns[descriptionIndex]?.trim()
        const category = columns[categoryIndex]?.trim()
        const amount = parseLocalizedAmount(columns[amountIndex] ?? '')
        const currency = normalizeCurrencyCode(columns[currencyIndex] || currentCompany.currency || 'USD')

        if (!date) {
          throw new Error(t('transactions.importRowInvalidDate').replace('{row}', String(rowNumber)))
        }

        if (!description) {
          throw new Error(t('transactions.importRowDescriptionRequired').replace('{row}', String(rowNumber)))
        }

        if (!category) {
          throw new Error(t('transactions.importRowCategoryRequired').replace('{row}', String(rowNumber)))
        }

        if (!Number.isFinite(amount)) {
          throw new Error(t('transactions.importRowAmountInvalid').replace('{row}', String(rowNumber)))
        }

        if (amount === 0) {
          throw new Error(t('transactions.importRowAmountNonZero').replace('{row}', String(rowNumber)))
        }

        if (!isSupportedCurrency(currency)) {
          throw new Error(t('transactions.importRowUnsupportedCurrency').replace('{row}', String(rowNumber)))
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

      const { error } = await supabase.from('incomes').insert(payload)
      if (error) throw error

      setSuccessMessage(t('transactions.importedRows').replace('{count}', String(payload.length)))
      await loadIncomes()
    } catch (error) {
      console.error('Income CSV import failed:', error)
      setErrorMessage(error instanceof Error ? error.message : t('transactions.importFailed'))
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
        <PageHeader title={t('income.title')} description={t('income.description')} />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('income.title')} description={t('income.description')} />
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
      <PageHeader title={t('income.title')} description={t('income.pageDescription').replace('{workspace}', currentCompany.name)}>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} size="sm" disabled={importing}>
            {importing ? t('transactions.importing') : t('common.importCsv')}
          </Button>
          {incomes.length > 0 && (
            <AppSelect
              value={groupReportsByMonth ? 'month' : 'default'}
              onChange={(value) => setGroupReportsByMonth(value === 'month')}
              options={[
                { value: 'default', label: t('common.noMonthGrouping') },
                { value: 'month', label: t('common.groupByMonth') },
              ]}
                ariaLabel={t('common.groupByMonth')}
              className="w-48"
            />
          )}
          {incomes.length > 0 && (
            <>
              <input
                type="date"
                value={filterFromDate}
                onChange={(event) => setFilterFromDate(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                aria-label={t('dashboard.filterFrom')}
              />
              <input
                type="date"
                value={filterToDate}
                onChange={(event) => setFilterToDate(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                aria-label={t('dashboard.filterTo')}
              />
            </>
          )}
          {incomes.length > 0 && (
            <>
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
            </>
          )}
          {incomes.length > 0 && <Button variant="outline" onClick={handleExportCSV} size="sm">{t('common.exportCsv')}</Button>}
          {incomes.length > 0 && <Button variant="outline" onClick={handlePrint} size="sm">{t('common.print')}</Button>}
          <Button onClick={() => { setShowForm(!showForm); setEditingEntry(null) }}>
            {showForm ? t('common.cancel') : t('income.add')}
          </Button>
        </div>
      </PageHeader>

      <div className="print-area print-report hidden">
        <div className="mb-4 flex items-start gap-3">
          {companyLogo ? (
            <img src={companyLogo} alt={currentCompany.name} className="h-12 w-12 object-contain" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
              {currentCompany.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold">{currentCompany.name}</h1>
            <p className="text-sm text-slate-600">{t('income.report')}</p>
            <p className="text-xs text-slate-600">{t('common.workspaceType')}: {currentCompany.type}</p>
            <p className="text-xs text-slate-600">{t('common.generated')}: {new Date().toLocaleString(intlLocale)}</p>
            <p className="text-xs text-slate-600">{t('common.period')}: {filterFromDate || '...'} - {filterToDate || '...'}</p>
            <p className="text-xs text-slate-600">{t('common.filters')}: {t('common.sortBy')} {sortBy}, {t('common.sortDirection')} {sortDirection}</p>
            {companyAddress && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddress}</p>}
          </div>
        </div>
        {printGroups.map(([groupKey, groupItems]) => (
          <section key={groupKey} className="mb-8">
            {groupReportsByMonth && <h2 className="mb-3 text-lg font-semibold">{formatMonthLabel(groupKey)}</h2>}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-2 text-left">{t('common.date')}</th>
                  <th className="border p-2 text-left">{t('common.description')}</th>
                  <th className="border p-2 text-left">{t('common.category')}</th>
                  <th className="border p-2 text-right">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((income) => (
                  <tr key={`print-${income.id}`}>
                    <td className="border p-2">{new Date(`${income.date}T00:00:00`).toLocaleDateString(intlLocale)}</td>
                    <td className="border p-2">{income.description}</td>
                    <td className="border p-2">{formatCategoryLabel(income.category, t)}</td>
                    <td className="border p-2 text-right">{renderPrintAmount(income)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <p className="mt-4 text-right font-semibold">
          {t('common.total')}: {formatCurrency(sortedIncomes.reduce((sum, income) => sum + getWorkspaceAmount(income), 0), normalizeCurrencyCode(currentCompany.currency ?? 'USD'), intlLocale)}
        </p>
      </div>

      {successMessage && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{successMessage}</div>}
      {errorMessage && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>}

      {showForm && !editingEntry && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingEntry ? t('income.edit') : t('income.add')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('common.amount')}</label>
                <input type="text" inputMode="decimal" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.amountPlaceholder')} required />
              </div>
              {isBusinessWorkspace ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.description')}</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value, category: formData.category || 'Sales' })}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder={t('common.description')}
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.category')}</label>
                  <AppSelect
                    value={formData.category}
                    onChange={(value) => setFormData({ ...formData, category: value })}
                    options={[
                      { value: '', label: t('income.categoryPlaceholder'), disabled: true },
                      ...categoryOptions.map((option) => ({ value: option, label: formatCategoryLabel(option, t) })),
                    ]}
                  />
                  {formData.category === 'Other' && (
                    <div className="mt-2 space-y-2">
                      <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder={t('income.customCategory')} required />
                      <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('common.description')} required />
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.date')}</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full rounded-md border px-3 py-2" required />
                </div>
                {!isBusinessWorkspace && (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.currency')}</label>
                  <AppSelect
                    value={formData.currency}
                    onChange={(value) => setFormData({ ...formData, currency: normalizeCurrencyCode(value) })}
                    options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                  />
                </div>
                )}
              </div>
              <Button type="submit">{editingEntry ? t('common.saveChanges') : t('income.save')}</Button>
              {!isBusinessWorkspace && (
                <p className="text-sm text-slate-500">
                  {latestRateLoading
                    ? t('income.latestRateLoading')
                    : t('income.latestRate')
                      .replace('{from}', normalizeCurrencyCode(formData.currency))
                      .replace('{rate}', (latestRate ?? 1).toFixed(4))
                      .replace('{to}', normalizeCurrencyCode(currentCompany.currency ?? 'USD'))}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {incomes.length === 0 ? (
        <EmptyState title={t('income.noEntries')} description={t('income.emptyDescription')} />
      ) : (
        <div className="space-y-4">
          {displayGroups.map(([groupKey, groupItems]) => (
            <div key={groupKey} className="space-y-4">
              {groupReportsByMonth && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{formatMonthLabel(groupKey)}</h2>}
              {groupItems.map((income) => (
            <div key={income.id} className="space-y-2">
            <Card>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{income.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCategoryLabel(income.category, t)} · {income.date}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-normal">
                      {formatCurrency(
                        convertToCurrency(
                          Number(income.amount),
                          income.currency,
                          normalizeCurrencyCode(currentCompany.currency ?? 'USD')
                        ),
                        normalizeCurrencyCode(currentCompany.currency ?? 'USD')
                      )}
                    </p>
                    {normalizeCurrencyCode(income.currency) !== normalizeCurrencyCode(currentCompany.currency ?? 'USD') && (
                      <p className="text-sm text-slate-500">
                        {formatCurrency(Number(income.amount), income.currency)}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="icon" onClick={() => handleEdit(income)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="destructive" size="icon" onClick={() => setDeleteId(income.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
            {editingEntry?.id === income.id && (
              <Card className="border-primary/30 bg-slate-50">
                <CardContent className="p-4">
                  <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
                    <input type="text" inputMode="decimal" value={formData.amount} onChange={(event) => setFormData({ ...formData, amount: event.target.value })} className="rounded-md border px-3 py-2" placeholder={t('transactions.amountPlaceholder')} aria-label={t('common.amount')} required />
                    <input value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="rounded-md border px-3 py-2" aria-label={t('common.description')} />
                    <input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} className="rounded-md border px-3 py-2" aria-label={t('common.date')} required />
                    <div className="flex gap-2">
                      <Button type="submit">{t('common.saveChanges')}</Button>
                      <Button type="button" variant="outline" onClick={() => { setEditingEntry(null); setShowForm(false) }}>{t('common.cancel')}</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
            </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('common.confirmDelete')}
        description={t('income.deleteConfirm')}
        confirmLabel={t('common.deleteAnyway')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          const id = deleteId
          setDeleteId(null)
          if (id) void handleDelete(id)
        }}
      />
    </PageContainer>
  )
}
