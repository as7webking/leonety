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
import { IncomeBulkTitleDialog } from '@/components/income-bulk-title-dialog'
import { AppSelect } from '@/components/app-select'
import { getIntlLocale } from '@/lib/i18n'
import { applyIncomeTitleToSelection } from '@/lib/income-bulk-title'
import { getCsvColumnIndex, normalizeCsvHeader, parseLocalizedAmount, parseTransactionDate, validateSignedAmountInput } from '@/lib/transaction-utils'

interface Income extends IncomeForm {
  id: string
  company_id: string
  title?: string | null
  reference?: string | null
  note?: string | null
  client_id?: string | null
  invoice_id?: string | null
  payment_method?: string | null
}

interface RelatedClient { id: string; name: string; client_company: string | null }
interface RelatedInvoice { id: string; invoice_number: string; client_id: string | null }

type IncomeFormState = Omit<IncomeForm, 'amount'> & {
  amount: string
  title: string
  reference: string
  note: string
  client_id: string
  invoice_id: string
  payment_method: string
}

function isMissingOptionalColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && ['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? ''))
}

function stripTitle<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload }
  delete next.title
  return next
}

function stripAccountingFields<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload }
  delete next.reference
  delete next.note
  delete next.client_id
  delete next.invoice_id
  delete next.payment_method
  return next
}

function uniqueRecentValues(items: Income[], selector: (item: Income) => string | null | undefined) {
  const seen = new Set<string>()
  const values: string[] = []
  for (const item of items) {
    const value = selector(item)?.trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    values.push(value)
    if (values.length >= 12) break
  }
  return values
}

export default function IncomePage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const intlLocale = getIntlLocale(locale)
  const [incomes, setIncomes] = useState<Income[]>([])
  const [clients, setClients] = useState<RelatedClient[]>([])
  const [invoices, setInvoices] = useState<RelatedInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<Income | null>(null)
  const [formData, setFormData] = useState<IncomeFormState>({
    amount: '',
    title: '',
    description: '',
    category: '',
    reference: '',
    note: '',
    client_id: '',
    invoice_id: '',
    payment_method: '',
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
  const [selectedIncomeIds, setSelectedIncomeIds] = useState<string[]>([])
  const [showBulkTitleDialog, setShowBulkTitleDialog] = useState(false)
  const [bulkTitleSubmitting, setBulkTitleSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isBusinessWorkspace = currentCompany?.type === 'business'
  const categoryOptions = currentCompany?.type === 'business'
    ? ['Sales', 'Service', 'Invoice Payment', 'Salary', 'Other']
    : ['Salary', 'Freelance', 'Investment', 'Other']
  const titleSuggestions = useMemo(() => uniqueRecentValues(incomes, (income) => income.title || income.description), [incomes])
  const descriptionSuggestions = useMemo(() => uniqueRecentValues(incomes, (income) => income.description), [incomes])
  const categorySuggestions = useMemo(() => uniqueRecentValues(incomes, (income) => income.category), [incomes])

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
      setSelectedIncomeIds([])
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const [incomeResult, clientResult, invoiceResult] = await Promise.all([
        supabase.from('incomes').select('*').eq('company_id', currentCompany.id).order('date', { ascending: false }),
        supabase.from('clients').select('id, name, client_company').eq('company_id', currentCompany.id).order('name'),
        supabase.from('invoices').select('id, invoice_number, client_id').eq('company_id', currentCompany.id).order('issue_date', { ascending: false }),
      ])

      if (incomeResult.error) throw incomeResult.error
      if (clientResult.error) throw clientResult.error
      if (invoiceResult.error) throw invoiceResult.error
      setIncomes((incomeResult.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })))
      setClients((clientResult.data ?? []) as RelatedClient[])
      setInvoices((invoiceResult.data ?? []) as RelatedInvoice[])
    } catch (error) {
      console.error('Failed to load incomes:', error)
      setErrorMessage(t('income.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase, t])

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
      setErrorMessage(t('common.noWorkspaceSelected'))
      return
    }

    try {
      const desiredTitle = formData.title.trim()
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
        title: desiredTitle || null,
        description: validatedData.description,
        date: validatedData.date,
        category,
        amount: validatedData.amount,
        currency: validatedData.currency,
        company_id: currentCompany.id,
        reference: formData.reference.trim() || null,
        note: formData.note.trim() || null,
        client_id: formData.client_id || null,
        invoice_id: formData.invoice_id || null,
        payment_method: formData.payment_method || null,
      }
      let titleFallback = false
      let accountingFallback = false

      const saveIncome = async (value: Record<string, unknown>) => editingEntry
        ? await supabase.from('incomes').update(value).eq('id', editingEntry.id).eq('company_id', currentCompany.id)
        : await supabase.from('incomes').insert(value)

      {
        let { error } = await saveIncome(payload)
        if (isMissingOptionalColumn(error)) {
          accountingFallback = Boolean(formData.reference || formData.note || formData.client_id || formData.invoice_id || formData.payment_method)
          const fallback = await saveIncome(stripAccountingFields(payload))
          error = fallback.error
        }
        if (isMissingOptionalColumn(error)) {
          const fallback = await saveIncome(stripTitle(stripAccountingFields(payload)))
          error = fallback.error
          titleFallback = !error && Boolean(desiredTitle)
        }
        if (error) throw error
        const baseMessage = editingEntry ? t('income.updated') : t('income.created')
        const migrationMessage = accountingFallback
          ? t('income.accountingFieldsMigrationRequired')
          : titleFallback ? t('transactions.titleMigrationRequired') : ''
        setSuccessMessage(migrationMessage ? `${baseMessage} ${migrationMessage}` : baseMessage)
      }

      setFormData({
        amount: '',
        title: '',
        description: '',
        category: '',
        reference: '',
        note: '',
        client_id: '',
        invoice_id: '',
        payment_method: '',
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
      title: entry.title ?? '',
      description: entry.description,
      category: entry.category,
      reference: entry.reference ?? '',
      note: entry.note ?? '',
      client_id: entry.client_id ?? '',
      invoice_id: entry.invoice_id ?? '',
      payment_method: entry.payment_method ?? '',
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

    const headers = [t('common.date'), t('transactions.titleLabel'), t('common.description'), t('common.category'), t('common.amount'), t('common.currency')]
    const rows = sortedIncomes.map((income) => [income.date, income.title ?? '', income.description, formatCategoryLabel(income.category, t), income.amount, income.currency])
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

  const visibleIncomeIds = useMemo(() => sortedIncomes.map((income) => income.id), [sortedIncomes])
  const selectedIncomeIdSet = useMemo(() => new Set(selectedIncomeIds), [selectedIncomeIds])
  const allVisibleSelected = visibleIncomeIds.length > 0 && visibleIncomeIds.every((id) => selectedIncomeIdSet.has(id))

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedIncomeIds((current) => {
      const next = new Set(current)
      for (const id of visibleIncomeIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return [...next]
    })
  }

  const toggleIncomeSelection = (id: string, checked: boolean) => {
    setSelectedIncomeIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((currentId) => currentId !== id)
    )
  }

  const handleBulkTitleUpdate = async (title: string) => {
    if (!currentCompany || selectedIncomeIds.length === 0 || bulkTitleSubmitting) return

    setBulkTitleSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const response = await fetch('/api/income/bulk-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: currentCompany.id,
          incomeIds: selectedIncomeIds,
          title,
        }),
      })
      const result = await response.json().catch(() => ({})) as { updatedCount?: number }

      if (!response.ok || result.updatedCount !== selectedIncomeIds.length) {
        throw new Error('bulk_income_title_update_failed')
      }

      const updatedCount = result.updatedCount
      setIncomes((current) => applyIncomeTitleToSelection(current, selectedIncomeIds, title))
      setSelectedIncomeIds([])
      setShowBulkTitleDialog(false)
      setSuccessMessage(t('income.bulkUpdated').replace('{count}', String(updatedCount)))
      window.setTimeout(() => setSuccessMessage(''), 3000)
    } catch {
      setErrorMessage(t('income.bulkUpdateFailed'))
      window.setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setBulkTitleSubmitting(false)
    }
  }

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
        throw new Error(t('transactions.importEmpty'))
      }

      const header = rows[0].map(normalizeCsvHeader)
      const dateIndex = getCsvColumnIndex(header, ['date'])
      const descriptionIndex = getCsvColumnIndex(header, ['description', 'name', 'title'])
      const titleIndex = getCsvColumnIndex(header, ['title'])
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
        const title = titleIndex >= 0 ? columns[titleIndex]?.trim() ?? '' : ''
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
          title: title || description,
          description,
          category,
          amount: Number(amount.toFixed(2)),
          currency,
        }
      })

      let { error } = await supabase.from('incomes').insert(payload)
      if (isMissingOptionalColumn(error)) {
        const fallback = await supabase.from('incomes').insert(payload.map(stripTitle))
        error = fallback.error
      }
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
                onChange={(event) => {
                  setFilterFromDate(event.target.value)
                  setSelectedIncomeIds([])
                }}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                aria-label={t('dashboard.filterFrom')}
              />
              <input
                type="date"
                value={filterToDate}
                onChange={(event) => {
                  setFilterToDate(event.target.value)
                  setSelectedIncomeIds([])
                }}
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
                  <th className="border p-2 text-left">{t('transactions.titleLabel')}</th>
                  <th className="border p-2 text-left">{t('common.description')}</th>
                  <th className="border p-2 text-left">{t('common.category')}</th>
                  <th className="border p-2 text-right">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {groupItems.map((income) => (
                  <tr key={`print-${income.id}`}>
                    <td className="border p-2">{new Date(`${income.date}T00:00:00`).toLocaleDateString(intlLocale)}</td>
                    <td className="border p-2">{income.title || '-'}</td>
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

      {sortedIncomes.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3">
          <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) => toggleVisibleSelection(event.target.checked)}
              className="h-4 w-4"
            />
            {t('income.bulkSelectVisible')}
          </label>
          <span className="text-sm text-slate-500">
            {t('income.bulkSelectedCount').replace('{count}', String(selectedIncomeIds.length))}
          </span>
          {selectedIncomeIds.length > 0 && (
            <Button type="button" size="sm" className="sm:ml-auto" onClick={() => setShowBulkTitleDialog(true)}>
              {t('income.bulkEdit')}
            </Button>
          )}
        </div>
      )}

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
              <div>
                <label className="mb-1 block text-sm font-medium">{t('transactions.titleLabel')}</label>
                <input type="text" list="income-title-suggestions" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.titlePlaceholder')} />
                <datalist id="income-title-suggestions">{titleSuggestions.map((value) => <option key={value} value={value} />)}</datalist>
              </div>
              {isBusinessWorkspace && (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.category')}</label>
                  <AppSelect
                    value={formData.category || 'Sales'}
                    onChange={(value) => setFormData({ ...formData, category: value })}
                    options={categoryOptions.map((option) => ({ value: option, label: formatCategoryLabel(option, t) }))}
                  />
                </div>
              )}
              {isBusinessWorkspace ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('common.description')}</label>
                  <input
                    type="text"
                    list="income-description-suggestions"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value, category: formData.category || 'Sales' })}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder={t('common.description')}
                  />
                  <datalist id="income-description-suggestions">{descriptionSuggestions.map((value) => <option key={value} value={value} />)}</datalist>
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
                      <input type="text" list="income-category-suggestions" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="w-full rounded-md border px-3 py-2" placeholder={t('income.customCategory')} required />
                      <datalist id="income-category-suggestions">{categorySuggestions.map((value) => <option key={value} value={value} />)}</datalist>
                      <input type="text" list="income-description-suggestions" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('common.description')} required />
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('income.client')} <span className="font-normal text-slate-500">({t('income.optional')})</span></span>
                  <AppSelect
                    value={formData.client_id}
                    onChange={(value) => setFormData({ ...formData, client_id: value, invoice_id: value ? formData.invoice_id : '' })}
                    options={[{ value: '', label: t('income.noClient') }, ...clients.map((client) => ({ value: client.id, label: client.client_company || client.name }))]}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('income.invoiceReference')} <span className="font-normal text-slate-500">({t('income.optional')})</span></span>
                  <AppSelect
                    value={formData.invoice_id}
                    onChange={(value) => {
                      const invoice = invoices.find((item) => item.id === value)
                      setFormData({ ...formData, invoice_id: value, client_id: invoice?.client_id || formData.client_id })
                    }}
                    options={[
                      { value: '', label: t('income.noInvoice') },
                      ...invoices.filter((invoice) => !formData.client_id || invoice.client_id === formData.client_id).map((invoice) => ({ value: invoice.id, label: invoice.invoice_number })),
                    ]}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('income.reference')} <span className="font-normal text-slate-500">({t('income.optional')})</span></span>
                  <input value={formData.reference} onChange={(event) => setFormData({ ...formData, reference: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t('income.paymentMethod')} <span className="font-normal text-slate-500">({t('income.optional')})</span></span>
                  <AppSelect value={formData.payment_method} onChange={(value) => setFormData({ ...formData, payment_method: value })} options={[
                    { value: '', label: t('common.none') },
                    { value: 'cash', label: t('invoices.paymentCash') },
                    { value: 'bank_transfer', label: t('invoices.paymentBankTransfer') },
                    { value: 'card', label: t('invoices.paymentCard') },
                  ]} />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">{t('income.note')} <span className="font-normal text-slate-500">({t('income.optional')})</span></span>
                  <textarea value={formData.note} onChange={(event) => setFormData({ ...formData, note: event.target.value })} className="min-h-20 w-full rounded-md border px-3 py-2" />
                </label>
              </div>
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
              <CardContent className="flex min-w-0 flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <label className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 lg:hidden">
                    <input
                      type="checkbox"
                      checked={selectedIncomeIdSet.has(income.id)}
                      onChange={(event) => toggleIncomeSelection(income.id, event.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="sr-only">
                      {t('income.bulkSelectRow').replace('{title}', income.title || income.description)}
                    </span>
                  </label>
                  <div className="min-w-0">
                  <p className="font-medium">{income.title || income.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {income.title && income.description ? `${income.description} · ` : ''}{formatCategoryLabel(income.category, t)} · {income.date}
                  </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
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
                  <label className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 lg:flex">
                    <input
                      type="checkbox"
                      checked={selectedIncomeIdSet.has(income.id)}
                      onChange={(event) => toggleIncomeSelection(income.id, event.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="sr-only">{t('income.bulkSelectRow').replace('{title}', income.title || income.description)}</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => handleEdit(income)} aria-label={`${t('common.edit')} ${income.title || income.description}`} title={t('common.edit')}><Edit className="h-4 w-4" /></Button>
                    <Button variant="destructive" size="icon" onClick={() => setDeleteId(income.id)} aria-label={`${t('common.delete')} ${income.title || income.description}`} title={t('common.delete')}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            {editingEntry?.id === income.id && (
              <Card className="border-primary/30 bg-slate-50">
                <CardContent className="p-4">
                  <form onSubmit={handleSubmit} className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('common.amount')}</span><input type="text" inputMode="decimal" value={formData.amount} onChange={(event) => setFormData({ ...formData, amount: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.amountPlaceholder')} required /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('transactions.titleLabel')}</span><input list="income-title-suggestions" value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.titlePlaceholder')} /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('common.category')}</span><input list="income-category-suggestions" value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('common.description')}</span><input list="income-description-suggestions" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('income.reference')}</span><input value={formData.reference} onChange={(event) => setFormData({ ...formData, reference: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('common.date')}</span><input type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('income.client')}</span><AppSelect value={formData.client_id} onChange={(value) => setFormData({ ...formData, client_id: value })} options={[{ value: '', label: t('income.noClient') }, ...clients.map((client) => ({ value: client.id, label: client.client_company || client.name }))]} /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('income.invoiceReference')}</span><AppSelect value={formData.invoice_id} onChange={(value) => setFormData({ ...formData, invoice_id: value })} options={[{ value: '', label: t('income.noInvoice') }, ...invoices.map((invoice) => ({ value: invoice.id, label: invoice.invoice_number }))]} /></label>
                    <label className="space-y-1"><span className="text-xs font-medium text-slate-600">{t('income.paymentMethod')}</span><AppSelect value={formData.payment_method} onChange={(value) => setFormData({ ...formData, payment_method: value })} options={[{ value: '', label: t('common.none') }, { value: 'cash', label: t('invoices.paymentCash') }, { value: 'bank_transfer', label: t('invoices.paymentBankTransfer') }, { value: 'card', label: t('invoices.paymentCard') }]} /></label>
                    <label className="space-y-1 md:col-span-2 lg:col-span-3"><span className="text-xs font-medium text-slate-600">{t('income.note')}</span><textarea value={formData.note} onChange={(event) => setFormData({ ...formData, note: event.target.value })} className="min-h-20 w-full rounded-md border px-3 py-2" /></label>
                    <div className="flex gap-2 md:col-span-2 lg:col-span-3">
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
      {showBulkTitleDialog && (
        <IncomeBulkTitleDialog
          submitting={bulkTitleSubmitting}
          labels={{
            title: t('income.bulkDialogTitle').replace('{count}', String(selectedIncomeIds.length)),
            warning: t('income.bulkWarning').replace('{count}', String(selectedIncomeIds.length)),
            changeTitle: t('income.bulkChangeTitle'),
            titleLabel: t('transactions.titleLabel'),
            titlePlaceholder: t('transactions.titlePlaceholder'),
            titleRequired: t('income.bulkTitleRequired'),
            cancel: t('common.cancel'),
            update: t('income.bulkUpdateButton').replace('{count}', String(selectedIncomeIds.length)),
          }}
          onCancel={() => {
            if (!bulkTitleSubmitting) setShowBulkTitleDialog(false)
          }}
          onSubmit={(title) => void handleBulkTitleUpdate(title)}
        />
      )}
    </PageContainer>
  )
}
