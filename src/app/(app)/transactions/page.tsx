'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, Building2, Copy, Printer, Plus } from 'lucide-react'
import { FINANCE_PAGE_SIZE, FinanceEmptyState, FinanceListRow, FinanceListShell, FinancePagination, FinanceSearchInput, FinanceSelectionBar, FinanceToolbar, EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCategoryLabel } from '@/lib/category-labels'
import { loadCompanyBranding } from '@/lib/company-branding'
import { currencyOptions, formatCurrency, isSupportedCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { parseCsv } from '@/lib/csv'
import { createClient } from '@/lib/supabase-client'
import { getIntlLocale } from '@/lib/i18n'
import { matchesFinanceSearch } from '@/lib/finance-ui'
import { buildKassenbuch, getKassenbuchText, isFullCalendarMonthSelected } from '@/lib/kassenbuch'
import { getCsvColumnIndex, normalizeCsvHeader, parseLocalizedAmount, parseTransactionDate, validateSignedAmountInput } from '@/lib/transaction-utils'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'

interface TransactionRow {
  id: string
  type: 'income' | 'expense'
  date: string
  title: string | null
  description: string | null
  category: string | null
  amount: number
  currency: string
  note: string | null
  reference: string | null
  payment_method: string | null
  invoice_id: string | null
  created_at: string | null
  cash_amount: number | null
}

interface SupabaseTransactionRow {
  id: string
  date: string
  title?: string | null
  description: string | null
  category: string | null
  amount: number | string
  currency: string
  note?: string | null
  reference?: string | null
  payment_method?: string | null
  invoice_id?: string | null
  created_at?: string | null
}

interface InvoicePaymentRow {
  invoice_id: string
  amount: number | string
  method: string
}

type PrintFormat = 'standard' | 'kassenbuch'

type BulkRenameTarget = 'all' | 'income' | 'expense'
type BulkRenameField = 'title' | 'description' | 'category'
type TransactionTable = 'incomes' | 'expenses'
type TransactionQueryResult = {
  data: SupabaseTransactionRow[] | null
  error: { code?: string; message?: string } | null
}

function isMissingOptionalColumn(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(error && ['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? ''))
}

function stripTitle<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload }
  delete next.title
  return next
}

export default function TransactionsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const intlLocale = getIntlLocale(locale)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showBulkRename, setShowBulkRename] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [bulkEdit, setBulkEdit] = useState({
    category: { enabled: false, value: '' },
    date: { enabled: false, value: '' },
    payment_method: { enabled: false, value: '' },
    note: { enabled: false, value: '' },
  })
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [printFromDate, setPrintFromDate] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [printToDate, setPrintToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [includeOpeningBalance, setIncludeOpeningBalance] = useState(false)
  const [printFormatDialogOpen, setPrintFormatDialogOpen] = useState(false)
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrintFormat>('standard')
  const [activePrintFormat, setActivePrintFormat] = useState<PrintFormat>('standard')
  const [showKassenbuchMonthEndBalance, setShowKassenbuchMonthEndBalance] = useState(false)
  const [showKassenbuchPageNumbers, setShowKassenbuchPageNumbers] = useState(false)
  const [companyLogo, setCompanyLogo] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '',
    title: '',
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
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  useBodyScrollLock(printFormatDialogOpen)

  const loadTransactions = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')
      setFormData((prev) => ({ ...prev, currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD') }))

      const queryTransactions = async (table: TransactionTable, includeTitle: boolean, includeAccounting: boolean): Promise<TransactionQueryResult> => {
        const columns = includeAccounting
          ? 'id, date, title, description, category, amount, currency, note, reference, payment_method, invoice_id, created_at'
          : includeTitle ? 'id, date, title, description, category, amount, currency, created_at' : 'id, date, description, category, amount, currency, created_at'
        return await supabase
          .from(table)
          .select(columns)
          .eq('company_id', currentCompany.id)
          .order('date', { ascending: false }) as TransactionQueryResult
      }

      let [incomeRes, expenseRes] = await Promise.all([
        queryTransactions('incomes', true, true),
        queryTransactions('expenses', true, true),
      ])

      if (isMissingOptionalColumn(incomeRes.error) || isMissingOptionalColumn(expenseRes.error)) {
        ;[incomeRes, expenseRes] = await Promise.all([
          queryTransactions('incomes', true, false),
          queryTransactions('expenses', true, false),
        ])
      }
      if (isMissingOptionalColumn(incomeRes.error) || isMissingOptionalColumn(expenseRes.error)) {
        ;[incomeRes, expenseRes] = await Promise.all([
          queryTransactions('incomes', false, false),
          queryTransactions('expenses', false, false),
        ])
      }

      if (incomeRes.error) throw incomeRes.error
      if (expenseRes.error) throw expenseRes.error

      const nextTransactions: TransactionRow[] = [
        ...((incomeRes.data ?? []) as SupabaseTransactionRow[]).map((item) => ({
          ...item,
          type: 'income' as const,
          title: item.title ?? null,
          note: item.note ?? null,
          reference: item.reference ?? null,
          payment_method: item.payment_method ?? null,
          invoice_id: item.invoice_id ?? null,
          created_at: item.created_at ?? null,
          cash_amount: null,
          amount: Number(item.amount),
        })),
        ...((expenseRes.data ?? []) as SupabaseTransactionRow[]).map((item) => ({
          ...item,
          type: 'expense' as const,
          title: item.title ?? null,
          note: item.note ?? null,
          reference: item.reference ?? null,
          payment_method: item.payment_method ?? null,
          invoice_id: item.invoice_id ?? null,
          created_at: item.created_at ?? null,
          cash_amount: null,
          amount: Number(item.amount),
        })),
      ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())

      const invoiceIds = Array.from(new Set(nextTransactions.flatMap((transaction) => (
        transaction.invoice_id ? [transaction.invoice_id] : []
      ))))
      const paymentRows: InvoicePaymentRow[] = []

      for (let index = 0; index < invoiceIds.length; index += 100) {
        const { data, error } = await supabase
          .from('invoice_payments')
          .select('invoice_id, amount, method')
          .in('invoice_id', invoiceIds.slice(index, index + 100))

        if (error) break
        paymentRows.push(...((data ?? []) as InvoicePaymentRow[]))
      }

      const invoicesWithAllocations = new Set(paymentRows.map((payment) => payment.invoice_id))
      const invoiceCashAmounts = paymentRows.reduce<Record<string, number>>((totals, payment) => {
        if (payment.method === 'cash') {
          totals[payment.invoice_id] = (totals[payment.invoice_id] ?? 0) + Number(payment.amount)
        }
        return totals
      }, {})

      for (const transaction of nextTransactions) {
        if (transaction.invoice_id && invoicesWithAllocations.has(transaction.invoice_id)) {
          transaction.cash_amount = invoiceCashAmounts[transaction.invoice_id] ?? 0
        }
      }

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

  useEffect(() => {
    const savedValue = window.localStorage.getItem('leonety-print-opening-balance')
    setIncludeOpeningBalance(savedValue === 'true')
  }, [])

  const handleOpeningBalanceChange = (checked: boolean) => {
    setIncludeOpeningBalance(checked)
    window.localStorage.setItem('leonety-print-opening-balance', String(checked))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage(t('common.noWorkspaceSelected'))
      return
    }

    if (!formData.description.trim()) {
      setErrorMessage(t('transactions.descriptionRequired'))
      return
    }

    let amount = 0
    try {
      amount = validateSignedAmountInput(formData.amount, {
        required: t('transactions.amountRequired'),
        invalid: t('transactions.amountInvalid'),
        nonZero: t('transactions.amountNonZero'),
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('transactions.amountInvalid'))
      return
    }

    const table = formData.type === 'income' ? 'incomes' : 'expenses'
    const payload = {
      company_id: currentCompany.id,
      amount,
      title: formData.title.trim() || null,
      description: formData.description.trim(),
      category: formData.category.trim() || 'Other',
      date: formData.date,
      currency: normalizeCurrencyCode(formData.currency),
    }

    let { error } = await supabase.from(table).insert(payload)
    if (isMissingOptionalColumn(error)) {
      const fallback = await supabase.from(table).insert(stripTitle(payload))
      error = fallback.error
    }

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setMessage(t('transactions.created'))
    setShowForm(false)
    setFormData({
      type: 'income',
      amount: '',
      title: '',
      description: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      currency: normalizeCurrencyCode(currentCompany.currency ?? 'USD'),
    })
    await loadTransactions()
  }

  const handleCopyTransaction = (transaction: TransactionRow) => {
    if (!currentCompany) return
    setMessage('')
    setErrorMessage('')
    setFormData({
      type: transaction.type,
      amount: String(transaction.amount),
      title: transaction.title ?? '',
      description: transaction.description ?? '',
      category: transaction.category ?? '',
      date: transaction.date,
      currency: normalizeCurrencyCode(transaction.currency),
    })
    setShowForm(true)
    setMessage(t('transactions.copyReady'))
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentCompany) return

    setImporting(true)
    setMessage('')
    setErrorMessage('')

    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) {
        throw new Error(t('transactions.importEmpty'))
      }

      const header = rows[0].map(normalizeCsvHeader)
      const typeIndex = getCsvColumnIndex(header, ['type'])
      const dateIndex = getCsvColumnIndex(header, ['date'])
      const descriptionIndex = getCsvColumnIndex(header, ['description', 'name', 'title'])
      const titleIndex = getCsvColumnIndex(header, ['title'])
      const categoryIndex = getCsvColumnIndex(header, ['category'])
      const amountIndex = getCsvColumnIndex(header, ['amount'])
      const currencyIndex = getCsvColumnIndex(header, ['currency'])

      if ([typeIndex, dateIndex, descriptionIndex, categoryIndex, amountIndex, currencyIndex].some((index) => index === -1)) {
        throw new Error(t('transactions.importMixedMissingColumns'))
      }

      const existingKeys = new Set(transactions.map((transaction) => [
        transaction.type,
        transaction.date,
        Number(transaction.amount).toFixed(2),
        (transaction.description ?? '').trim().toLowerCase(),
        (transaction.category ?? '').trim().toLowerCase(),
        normalizeCurrencyCode(transaction.currency),
      ].join('|')))
      const payloads = {
        income: [] as Array<Record<string, unknown>>,
        expense: [] as Array<Record<string, unknown>>,
      }
      let skippedDuplicates = 0

      for (const [index, columns] of rows.slice(1).entries()) {
        const rowNumber = index + 2
        const rawType = (columns[typeIndex] ?? '').trim().toLowerCase()
        const type = rawType === 'income' || rawType === t('income.title').toLowerCase()
          ? 'income'
          : rawType === 'expense' || rawType === t('expenses.title').toLowerCase()
            ? 'expense'
            : null
        const date = parseTransactionDate(columns[dateIndex] ?? '')
        const description = columns[descriptionIndex]?.trim() ?? ''
        const title = titleIndex >= 0 ? columns[titleIndex]?.trim() ?? '' : ''
        const category = columns[categoryIndex]?.trim() ?? ''
        const amount = parseLocalizedAmount(columns[amountIndex] ?? '')
        const currency = normalizeCurrencyCode(columns[currencyIndex] || currentCompany.currency || 'USD')

        if (!type) throw new Error(t('transactions.importRowTypeInvalid').replace('{row}', String(rowNumber)))
        if (!date) throw new Error(t('transactions.importRowInvalidDate').replace('{row}', String(rowNumber)))
        if (!description) throw new Error(t('transactions.importRowDescriptionRequired').replace('{row}', String(rowNumber)))
        if (!category) throw new Error(t('transactions.importRowCategoryRequired').replace('{row}', String(rowNumber)))
        if (!Number.isFinite(amount)) throw new Error(t('transactions.importRowAmountInvalid').replace('{row}', String(rowNumber)))
        if (amount === 0) throw new Error(t('transactions.importRowAmountNonZero').replace('{row}', String(rowNumber)))
        if (!isSupportedCurrency(currency)) throw new Error(t('transactions.importRowUnsupportedCurrency').replace('{row}', String(rowNumber)))

        const key = [type, date, Number(amount).toFixed(2), description.toLowerCase(), category.toLowerCase(), currency].join('|')
        if (existingKeys.has(key)) {
          skippedDuplicates += 1
          continue
        }

        existingKeys.add(key)
        payloads[type].push({
          company_id: currentCompany.id,
          date,
          title: title || description,
          description,
          category,
          amount: Number(amount.toFixed(2)),
          currency,
        })
      }

      if (payloads.income.length > 0) {
        let { error } = await supabase.from('incomes').insert(payloads.income)
        if (isMissingOptionalColumn(error)) {
          const fallback = await supabase.from('incomes').insert(payloads.income.map(stripTitle))
          error = fallback.error
        }
        if (error) throw error
      }

      if (payloads.expense.length > 0) {
        let { error } = await supabase.from('expenses').insert(payloads.expense)
        if (isMissingOptionalColumn(error)) {
          const fallback = await supabase.from('expenses').insert(payloads.expense.map(stripTitle))
          error = fallback.error
        }
        if (error) throw error
      }

      setMessage(t('transactions.importedRowsWithSkipped')
        .replace('{count}', String(payloads.income.length + payloads.expense.length))
        .replace('{skipped}', String(skippedDuplicates)))
      await loadTransactions()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('transactions.importFailed'))
    } finally {
      setImporting(false)
      event.target.value = ''
    }
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
        if (bulkRename.field === 'title' && isMissingOptionalColumn(error)) {
          setErrorMessage(t('transactions.titleMigrationRequired'))
          return
        }
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

  const getSelectionKey = (transaction: TransactionRow) => `${transaction.type}:${transaction.id}`

  const handleSelectedUpdate = async () => {
    if (!currentCompany || selectedTransactions.length === 0) return

    const payload: Record<string, string | null> = {}
    if (bulkEdit.category.enabled) payload.category = bulkEdit.category.value.trim() || null
    if (bulkEdit.date.enabled) payload.date = bulkEdit.date.value
    if (bulkEdit.payment_method.enabled) payload.payment_method = bulkEdit.payment_method.value || null
    if (bulkEdit.note.enabled) payload.note = bulkEdit.note.value.trim() || null

    if (Object.keys(payload).length === 0) {
      setErrorMessage(t('transactions.bulkChooseField'))
      return
    }
    if (bulkEdit.date.enabled && !bulkEdit.date.value) {
      setErrorMessage(t('transactions.bulkChooseField'))
      return
    }

    if (!window.confirm(t('transactions.bulkEditWarning').replace('{count}', String(selectedTransactions.length)))) return

    setErrorMessage('')
    setMessage('')
    let updatedCount = 0

    for (const type of ['income', 'expense'] as const) {
      const ids = selectedTransactions
        .filter((value) => value.startsWith(`${type}:`))
        .map((value) => value.slice(type.length + 1))

      if (ids.length === 0) continue

      const { error } = await supabase
        .from(type === 'income' ? 'incomes' : 'expenses')
        .update(payload)
        .eq('company_id', currentCompany.id)
        .in('id', ids)

      if (error) {
        if (isMissingOptionalColumn(error)) {
          setErrorMessage(t('transactions.bulkMigrationRequired'))
          return
        }
        setErrorMessage(error.message)
        return
      }

      updatedCount += ids.length
    }

    setMessage(t('transactions.bulkSelectedDone').replace('{count}', String(updatedCount)))
    setSelectedTransactions([])
    setBulkEdit({
      category: { enabled: false, value: '' },
      date: { enabled: false, value: '' },
      payment_method: { enabled: false, value: '' },
      note: { enabled: false, value: '' },
    })
    await loadTransactions()
  }

  const handleEksExport = () => {
    const monthly = printableTransactions.reduce<Record<string, { income: number; expense: number }>>((acc, transaction) => {
      const month = transaction.date.slice(0, 7)
      const current = acc[month] ?? { income: 0, expense: 0 }
      current[transaction.type] += transaction.amount
      acc[month] = current
      return acc
    }, {})

    const rows = [
      ['Monat', 'Betriebseinnahmen', 'Betriebsausgaben', 'Gewinn', 'Währung'],
      ...Object.entries(monthly)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, totals]) => [
          month,
          totals.income.toFixed(2).replace('.', ','),
          totals.expense.toFixed(2).replace('.', ','),
          (totals.income - totals.expense).toFixed(2).replace('.', ','),
          normalizeCurrencyCode(currentCompany?.currency ?? 'EUR'),
        ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `eks-euer-${printFromDate || 'start'}-${printToDate || 'end'}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = (format: PrintFormat) => {
    setActivePrintFormat(format)
    setPrintFormatDialogOpen(false)
    window.setTimeout(() => {
      const previousTitle = document.title
      document.title = ' '
      window.print()
      window.setTimeout(() => {
        document.title = previousTitle
      }, 500)
    }, 0)
  }

  const sortedTransactions = useMemo(() => {
    return transactions.filter((transaction) => matchesFinanceSearch(searchQuery, [transaction.title, transaction.description, transaction.category, transaction.reference]))
      .sort((left, right) => {
      const leftValue = sortBy === 'date' ? new Date(left.date).getTime() : left.amount
      const rightValue = sortBy === 'date' ? new Date(right.date).getTime() : right.amount
      return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
    })
  }, [transactions, searchQuery, sortBy, sortDirection])
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / FINANCE_PAGE_SIZE))
  const paginatedTransactions = useMemo(() => sortedTransactions.slice((page - 1) * FINANCE_PAGE_SIZE, page * FINANCE_PAGE_SIZE), [page, sortedTransactions])
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages])
  useEffect(() => setPage(1), [searchQuery, sortBy, sortDirection])
  const visibleTransactionKeys = useMemo(() => paginatedTransactions.map(getSelectionKey), [paginatedTransactions])
  const selectedTransactionSet = useMemo(() => new Set(selectedTransactions), [selectedTransactions])
  const allVisibleTransactionsSelected = visibleTransactionKeys.length > 0 && visibleTransactionKeys.every((key) => selectedTransactionSet.has(key))
  const toggleVisibleTransactions = (checked: boolean) => {
    setSelectedTransactions((current) => {
      const next = new Set(current)
      visibleTransactionKeys.forEach((key) => checked ? next.add(key) : next.delete(key))
      return [...next]
    })
  }

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

  const openingTransactions = useMemo(
    () => printFromDate ? transactions.filter((transaction) => transaction.date < printFromDate) : [],
    [printFromDate, transactions]
  )

  const kassenbuchCurrency = normalizeCurrencyCode(currentCompany?.currency ?? 'EUR')
  const kassenbuch = useMemo(() => buildKassenbuch({
    openingTransactions,
    periodTransactions: printableTransactions,
    currency: kassenbuchCurrency,
  }), [kassenbuchCurrency, openingTransactions, printableTransactions])

  const formatMinorCurrency = (minorUnits: number) => (
    formatCurrency(minorUnits / 100, kassenbuchCurrency, intlLocale)
  )
  const formatPrintDate = (date: string) => date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(intlLocale)
    : '...'
  const formatPrintMonth = (monthKey: string) => new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${monthKey}-01T00:00:00`))
  const lastKassenbuchRow = kassenbuch.rows.at(-1)
  const periodEndDate = printToDate
    || (lastKassenbuchRow?.kind === 'daily-closing'
      ? lastKassenbuchRow.date
      : lastKassenbuchRow?.transaction.date)
    || printFromDate

  const formatTotalsByCurrency = (items: TransactionRow[]) => {
    const totals = getTotalsByCurrency(items)
    const totalText = Object.entries(totals)
      .map(([currency, amount]) => formatCurrency(amount, currency, intlLocale))
      .join(' · ')

    return totalText || formatCurrency(0, normalizeCurrencyCode(currentCompany?.currency ?? 'USD'), intlLocale)
  }

  const getTotalsByCurrency = (items: TransactionRow[]) =>
    items.reduce<Record<string, number>>((acc, transaction) => {
      const currency = normalizeCurrencyCode(transaction.currency)
      acc[currency] = (acc[currency] ?? 0) + transaction.amount
      return acc
    }, {})

  const formatNetTotals = (items: TransactionRow[]) => {
    const incomeTotals = getTotalsByCurrency(items.filter((transaction) => transaction.type === 'income'))
    const expenseTotals = getTotalsByCurrency(items.filter((transaction) => transaction.type === 'expense'))
    const currencies = Array.from(new Set([...Object.keys(incomeTotals), ...Object.keys(expenseTotals)]))

    if (currencies.length === 0) {
      return formatCurrency(0, normalizeCurrencyCode(currentCompany?.currency ?? 'USD'), intlLocale)
    }

    return currencies
      .map((currency) => formatCurrency((incomeTotals[currency] ?? 0) - (expenseTotals[currency] ?? 0), currency, intlLocale))
      .join(' · ')
  }

  const closingTransactions = includeOpeningBalance
    ? [...openingTransactions, ...printableTransactions]
    : printableTransactions

  const renderPrintCell = (transaction: TransactionRow | undefined) => {
    if (!transaction) return null
    const categoryLabel = formatCategoryLabel(transaction.category, t)
    const displayTitle = transaction.title || transaction.description || transaction.date
    const isDefaultBusinessIncome =
      currentCompany?.type === 'business' &&
      transaction.type === 'income' &&
      !transaction.title &&
      (!transaction.description ||
        transaction.description === transaction.category ||
        transaction.description === categoryLabel)

    return (
      <div className="break-inside-avoid space-y-1">
        <div className="flex justify-between gap-3">
          <span className="font-medium">
            {isDefaultBusinessIncome
              ? new Date(`${transaction.date}T00:00:00`).toLocaleDateString(intlLocale)
              : displayTitle}
          </span>
          <span className="whitespace-nowrap font-semibold">
            {formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency), intlLocale)}
          </span>
        </div>
        {!isDefaultBusinessIncome && (
          <div className="text-xs text-slate-600">
            {new Date(`${transaction.date}T00:00:00`).toLocaleDateString(intlLocale)}
            {transaction.title && transaction.description ? ` · ${transaction.description}` : ''}
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
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} />
      <PageHeader title={t('transactions.title')} description={`${t('transactions.description')} · ${currentCompany.name}`}>
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          <Plus className="h-4 w-4" />
          {showForm ? t('common.cancel') : t('transactions.add')}
        </Button>
      </PageHeader>
      <FinanceToolbar
        filtersLabel={t('finance.filters')}
        utilitiesLabel={t('finance.utilities')}
        filters={<>
          <FinanceSearchInput value={searchQuery} onChange={(value) => { setSearchQuery(value); setSelectedTransactions([]) }} label={t('finance.search')} placeholder={t('finance.searchPlaceholder')} />
          <AppSelect value={sortBy} onChange={(value) => setSortBy(value as 'date' | 'amount')} options={[{ value: 'date', label: t('common.sortDate') }, { value: 'amount', label: t('common.sortAmount') }]} ariaLabel={t('common.sortBy')} className="w-full lg:w-36" />
          <AppSelect value={sortDirection} onChange={(value) => setSortDirection(value as 'asc' | 'desc')} options={[{ value: 'desc', label: t('common.descending') }, { value: 'asc', label: t('common.ascending') }]} ariaLabel={t('common.sortDirection')} className="w-full lg:w-40" />
          <Button type="button" variant="outline" onClick={() => setShowBulkRename((value) => !value)}>{showBulkRename ? t('common.cancel') : t('transactions.bulkRename')}</Button>
        </>}
        utilities={<>
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>{importing ? t('transactions.importing') : t('common.importCsv')}</Button>
          <label className="grid gap-1 text-sm text-slate-600 lg:flex lg:items-center lg:gap-2"><span>{t('transactions.printFrom')}</span><input type="date" value={printFromDate} onChange={(event) => setPrintFromDate(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm lg:w-auto" /></label>
          <label className="grid gap-1 text-sm text-slate-600 lg:flex lg:items-center lg:gap-2"><span>{t('transactions.printTo')}</span><input type="date" value={printToDate} onChange={(event) => setPrintToDate(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm lg:w-auto" /></label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"><input type="checkbox" checked={includeOpeningBalance} onChange={(event) => handleOpeningBalanceChange(event.target.checked)} className="h-4 w-4" />{t('transactions.includeOpeningBalance')}</label>
          <Button type="button" variant="outline" onClick={() => setPrintFormatDialogOpen(true)} disabled={printableTransactions.length === 0}><Printer className="h-4 w-4" />{t('common.print')}</Button>
          <Button type="button" variant="outline" onClick={handleEksExport} disabled={printableTransactions.length === 0}>{t('transactions.exportEks')}</Button>
        </>}
      />

      {printFormatDialogOpen && (
        <div
          className="no-print fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-[max(1rem,env(safe-area-inset-top))] sm:py-12"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPrintFormatDialogOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-format-title"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id="print-format-title" className="text-lg font-semibold text-slate-950">
              {t('kassenbuch.printFormat')}
            </h2>
            <div className="mt-4 grid gap-2">
              {(['standard', 'kassenbuch'] as const).map((format) => (
                <label key={format} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-4 py-3 text-sm font-medium">
                  <input
                    type="radio"
                    name="transaction-print-format"
                    value={format}
                    checked={selectedPrintFormat === format}
                    onChange={() => setSelectedPrintFormat(format)}
                    className="h-4 w-4"
                  />
                  {format === 'standard' ? t('kassenbuch.standard') : t('kassenbuch.title')}
                </label>
              ))}
            </div>
            {selectedPrintFormat === 'kassenbuch' && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={showKassenbuchMonthEndBalance}
                    onChange={(event) => setShowKassenbuchMonthEndBalance(event.target.checked)}
                    className="h-4 w-4"
                  />
                  {t('kassenbuch.showMonthEndBalance')}
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={showKassenbuchPageNumbers}
                    onChange={(event) => setShowKassenbuchPageNumbers(event.target.checked)}
                    className="h-4 w-4"
                  />
                  {t('kassenbuch.showPageNumbers')}
                </label>
                <p className="text-xs leading-5 text-slate-600">
                  {t('kassenbuch.pageNumberingHint')}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setPrintFormatDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={() => handlePrint(selectedPrintFormat)}>
                <Printer className="h-4 w-4" />
                {t('common.print')}
              </Button>
            </div>
          </section>
        </div>
      )}

      {activePrintFormat === 'standard' && <div className="print-area print-compact print-report hidden">
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
        {includeOpeningBalance && (
          <div className="mb-2 border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm">
            <span className="font-medium">{t('dashboard.openingBalance')}:</span>{' '}
            <span className="font-semibold">{formatNetTotals(openingTransactions)}</span>
          </div>
        )}
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
          <tfoot>
            <tr className="font-semibold">
              <td className="border p-2 text-right">
                {t('income.title')}: {formatTotalsByCurrency(printColumns.incomes)}
              </td>
              <td className="border p-2 text-right">
                {t('expenses.title')}: {formatTotalsByCurrency(printColumns.expenses)}
              </td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-3 space-y-1 border-t-2 border-slate-900 pt-2 text-right">
          <p className="text-sm font-semibold">
            {t('dashboard.periodResult')}: {formatNetTotals(printableTransactions)}
          </p>
          <p className="text-base font-bold">
            {t('dashboard.closingBalance')}: {formatNetTotals(closingTransactions)}
          </p>
        </div>
      </div>}

      {activePrintFormat === 'kassenbuch' && (
        <div className="print-area print-kassenbuch hidden">
          {showKassenbuchPageNumbers && (
            <style media="print">{`
              @page {
                @bottom-center {
                  content: ${JSON.stringify(`${t('kassenbuch.page')} `)} counter(page);
                  color: #4b5563;
                  font-family: Arial, Helvetica, sans-serif;
                  font-size: 8pt;
                }
              }
            `}</style>
          )}
          <header className="kassenbuch-header">
            <div className="kassenbuch-identity">
              {companyLogo && (
                // The print-only workspace logo may be a data URL or an external provider URL.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogo} alt="" className="kassenbuch-company-logo" />
              )}
              <div>
                <p className="kassenbuch-company">{currentCompany.name}</p>
                {companyAddress && <p className="kassenbuch-address">{companyAddress}</p>}
              </div>
            </div>
            <div className="kassenbuch-document-meta">
              <h1>{t('kassenbuch.title')}</h1>
              <dl>
                <div><dt>{t('kassenbuch.period')}</dt><dd>{formatPrintDate(printFromDate)} – {formatPrintDate(printToDate)}</dd></div>
                <div><dt>{t('kassenbuch.currency')}</dt><dd>{kassenbuchCurrency}</dd></div>
              </dl>
            </div>
          </header>

          <div className="kassenbuch-opening">
            <span>{t('dashboard.openingBalance')}</span>
            <strong>{formatMinorCurrency(kassenbuch.openingBalanceMinor)}</strong>
          </div>

          {kassenbuch.months.map((month, monthIndex) => (
            <section key={month.key} className="kassenbuch-month">
              <h2>{formatPrintMonth(month.key)}</h2>
              {monthIndex > 0 && (
                <div className="kassenbuch-month-opening">
                  <span>{t('dashboard.openingBalance')}</span>
                  <strong>{formatMinorCurrency(month.openingBalanceMinor)}</strong>
                </div>
              )}
              <table className="kassenbuch-table">
                <colgroup>
                  <col className="kassenbuch-income-column" />
                  <col className="kassenbuch-expense-column" />
                  <col className="kassenbuch-date-column" />
                  <col className="kassenbuch-balance-column" />
                  <col className="kassenbuch-text-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('kassenbuch.income')}</th>
                    <th>{t('kassenbuch.expenses')}</th>
                    <th>{t('kassenbuch.date')}</th>
                    <th>{t('kassenbuch.balance')}</th>
                    <th>{t('kassenbuch.text')}</th>
                  </tr>
                </thead>
                <tbody>
                  {month.rows.map((row, index) => row.kind === 'transaction' ? (
                    <tr key={`${row.transaction.type}:${row.transaction.id}`} className="kassenbuch-transaction-row">
                      <td className="kassenbuch-amount">{row.incomeMinor === null ? '' : formatMinorCurrency(row.incomeMinor)}</td>
                      <td className="kassenbuch-amount">{row.expenseMinor === null ? '' : formatMinorCurrency(row.expenseMinor)}</td>
                      <td className="kassenbuch-date">{formatPrintDate(row.transaction.date)}</td>
                      <td className="kassenbuch-amount">{formatMinorCurrency(row.balanceMinor)}</td>
                      <td className="kassenbuch-text">{getKassenbuchText(row.transaction, t('kassenbuch.genericTransaction'))}</td>
                    </tr>
                  ) : (
                    <tr key={`daily-closing:${row.date}:${index}`} className="kassenbuch-daily-closing">
                      <td />
                      <td />
                      <td className="kassenbuch-date">{formatPrintDate(row.date)}</td>
                      <td className="kassenbuch-amount">{formatMinorCurrency(row.balanceMinor)}</td>
                      <td className="kassenbuch-text">{t('kassenbuch.dailyClosing')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {showKassenbuchMonthEndBalance && (
                <div className="kassenbuch-month-end">
                  <span>
                    {(isFullCalendarMonthSelected(month.key, printFromDate, printToDate)
                      ? t('kassenbuch.monthEndBalance')
                      : t('kassenbuch.partialMonthEndBalance'))
                      .replace('{month}', formatPrintMonth(month.key))}
                  </span>
                  <strong>{formatMinorCurrency(month.closingBalanceMinor)}</strong>
                </div>
              )}
            </section>
          ))}

          <section className="kassenbuch-period-summary">
            <h2>{t('kassenbuch.summary')}</h2>
            <dl>
              <div><dt>{t('dashboard.openingBalance')}</dt><dd>{formatMinorCurrency(kassenbuch.openingBalanceMinor)}</dd></div>
              <div><dt>{t('kassenbuch.income')}</dt><dd>{formatMinorCurrency(kassenbuch.incomeTotalMinor)}</dd></div>
              <div><dt>{t('kassenbuch.expenses')}</dt><dd>{formatMinorCurrency(kassenbuch.expenseTotalMinor)}</dd></div>
              <div className="kassenbuch-final-balance">
                <dt>{t('kassenbuch.finalBalanceOn').replace('{date}', formatPrintDate(periodEndDate))}</dt>
                <dd>{formatMinorCurrency(kassenbuch.closingBalanceMinor)}</dd>
              </div>
            </dl>
          </section>

          {(kassenbuch.unclassifiedPaymentCount > 0 ||
            kassenbuch.excludedNonCashCount > 0 ||
            kassenbuch.excludedCurrencyCount > 0) && (
            <footer className="kassenbuch-notes">
              {kassenbuch.unclassifiedPaymentCount > 0 && (
                <p>{t('kassenbuch.unclassifiedNotice').replace('{count}', String(kassenbuch.unclassifiedPaymentCount))}</p>
              )}
              {kassenbuch.excludedNonCashCount > 0 && (
                <p>{t('kassenbuch.nonCashNotice').replace('{count}', String(kassenbuch.excludedNonCashCount))}</p>
              )}
              {kassenbuch.excludedCurrencyCount > 0 && (
                <p>{t('kassenbuch.currencyNotice').replace('{count}', String(kassenbuch.excludedCurrencyCount))}</p>
              )}
            </footer>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>
      )}

      {sortedTransactions.length > 0 && (
        <FinanceSelectionBar checked={allVisibleTransactionsSelected} onCheckedChange={toggleVisibleTransactions} selectVisibleLabel={t('finance.selectVisible')} selectedLabel={t('finance.selectedCount').replace('{count}', String(selectedTransactions.length))} />
      )}

      {selectedTransactions.length > 0 && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t('transactions.bulkEditTitle').replace('{count}', String(selectedTransactions.length))}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">{t('transactions.bulkEditWarning').replace('{count}', String(selectedTransactions.length))}</p>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={bulkEdit.category.enabled} onChange={(event) => setBulkEdit((current) => ({ ...current, category: { ...current.category, enabled: event.target.checked } }))} />{t('transactions.bulkCategory')}</span>
                <input disabled={!bulkEdit.category.enabled} value={bulkEdit.category.value} onChange={(event) => setBulkEdit((current) => ({ ...current, category: { ...current.category, value: event.target.value } }))} className="mt-2 w-full rounded-md border px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={bulkEdit.date.enabled} onChange={(event) => setBulkEdit((current) => ({ ...current, date: { ...current.date, enabled: event.target.checked } }))} />{t('transactions.bulkDate')}</span>
                <input type="date" disabled={!bulkEdit.date.enabled} value={bulkEdit.date.value} onChange={(event) => setBulkEdit((current) => ({ ...current, date: { ...current.date, value: event.target.value } }))} className="mt-2 w-full rounded-md border px-3 py-2 disabled:bg-slate-100" />
              </label>
              <label className="rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={bulkEdit.payment_method.enabled} onChange={(event) => setBulkEdit((current) => ({ ...current, payment_method: { ...current.payment_method, enabled: event.target.checked } }))} />{t('transactions.bulkPaymentMethod')}</span>
                <AppSelect disabled={!bulkEdit.payment_method.enabled} value={bulkEdit.payment_method.value} onChange={(value) => setBulkEdit((current) => ({ ...current, payment_method: { ...current.payment_method, value } }))} options={[{ value: '', label: t('common.none') }, { value: 'cash', label: t('invoices.paymentCash') }, { value: 'bank_transfer', label: t('invoices.paymentBankTransfer') }, { value: 'card', label: t('invoices.paymentCard') }]} className="mt-2" />
              </label>
              <label className="rounded-md border p-3">
                <span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={bulkEdit.note.enabled} onChange={(event) => setBulkEdit((current) => ({ ...current, note: { ...current.note, enabled: event.target.checked } }))} />{t('transactions.bulkNote')}</span>
                <input disabled={!bulkEdit.note.enabled} value={bulkEdit.note.value} onChange={(event) => setBulkEdit((current) => ({ ...current, note: { ...current.note, value: event.target.value } }))} className="mt-2 w-full rounded-md border px-3 py-2 disabled:bg-slate-100" />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedTransactions([])}>{t('common.cancel')}</Button>
              <Button type="button" onClick={() => void handleSelectedUpdate()}>{t('transactions.bulkConfirm')}</Button>
            </div>
          </CardContent>
        </Card>
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
                    { value: 'title', label: t('transactions.titleLabel') },
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
                  placeholder={t('transactions.bulkOldValuePlaceholder')}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('transactions.bulkNewValue')}</span>
                <input
                  value={bulkRename.to}
                  onChange={(event) => setBulkRename({ ...bulkRename, to: event.target.value })}
                  className="w-full rounded-md border px-3 py-2"
                  placeholder={t('transactions.bulkNewValuePlaceholder')}
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
                              {transaction.type === 'income' ? t('income.title') : t('expenses.title')} · {transaction.title || transaction.description || transaction.date}
                            </span>
                            <span className="block truncate text-slate-600">
                              {transaction.title && transaction.description ? `${transaction.description} · ` : ''}{formatCategoryLabel(transaction.category, t)} · {transaction.date} · {formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency), intlLocale)}
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
                <input type="text" inputMode="decimal" value={formData.amount} onChange={(event) => setFormData({ ...formData, amount: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.amountPlaceholder')} required />
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
                <span className="text-sm font-medium">{t('transactions.titleLabel')}</span>
                <input value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('transactions.titlePlaceholder')} />
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

      {sortedTransactions.length === 0 ? (
        <FinanceEmptyState filtered={transactions.length > 0} emptyTitle={t('common.noTransactions')} emptyDescription={t('transactions.emptyDescription')} filteredTitle={t('finance.filteredEmptyTitle')} filteredDescription={t('finance.filteredEmptyDescription')} action={{ label: t('transactions.add'), onClick: () => setShowForm(true) }} />
      ) : (
        <FinanceListShell titleLabel={t('transactions.titleLabel')} categoryLabel={t('common.category')} dateLabel={t('common.date')} amountLabel={t('common.amount')} selectionLabel={t('transactions.select')} actionsLabel={t('finance.actions')}>
          {paginatedTransactions.map((transaction) => {
            const isIncome = transaction.type === 'income'
            const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle

            return (
              <FinanceListRow
                key={`${transaction.type}-${transaction.id}`}
                title={transaction.title || transaction.description || '-'}
                description={transaction.title ? transaction.description : undefined}
                badge={<span className={`inline-flex items-center gap-1 text-xs font-medium ${isIncome ? 'text-emerald-700' : 'text-red-700'}`}><Icon className="h-4 w-4" />{isIncome ? t('income.title') : t('expenses.title')}</span>}
                category={formatCategoryLabel(transaction.category, t)}
                date={transaction.date}
                amount={formatCurrency(transaction.amount, normalizeCurrencyCode(transaction.currency), intlLocale)}
                selection={<label className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200"><input type="checkbox" checked={selectedTransactionSet.has(getSelectionKey(transaction))} onChange={(event) => { const key = getSelectionKey(transaction); setSelectedTransactions((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((value) => value !== key)) }} aria-label={`${t('transactions.select')} ${transaction.title || transaction.description || transaction.date}`} className="h-4 w-4" /></label>}
                actions={<Button size="icon" variant="outline" onClick={() => handleCopyTransaction(transaction)} aria-label={`${t('common.copy')} ${transaction.title || transaction.description || transaction.date}`} title={t('common.copy')}><Copy className="h-4 w-4" /></Button>}
              />
            )
          })}
        </FinanceListShell>
      )}
      {sortedTransactions.length > 0 && <FinancePagination page={page} totalPages={totalPages} totalItems={sortedTransactions.length} label={t('finance.pagination')} previousLabel={t('finance.previous')} nextLabel={t('finance.next')} onPageChange={setPage} />}
    </PageContainer>
  )
}
