'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader, EmptyState, LoadingSkeleton } from '@/components'
import { createClient } from '@/lib/supabase-client'
import { convertToCurrency, formatCurrency, getSavedAmountInWorkspaceCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { useCompany } from '@/contexts/company-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { useI18n } from '@/contexts/i18n-context'
import { AppSelect } from '@/components/app-select'
import { Building2 } from 'lucide-react'

interface Income {
  id: string
  amount: number
  description: string
  category: string
  date: string
  currency: string
  company_id: string
  exchange_rate?: number
  workspace_currency?: string
}

interface Expense {
  id: string
  amount: number
  description: string
  category: string
  date: string
  currency: string
  company_id: string
  exchange_rate?: number
  workspace_currency?: string
}

interface TimeEntry {
  id: string
  description: string
  hours: number
  date: string
  company_id: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const [incomes, setIncomes] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [filterFromDate, setFilterFromDate] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [filterToDate, setFilterToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [groupByMonth, setGroupByMonth] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const { accountAccess } = useAccountAccess(accountEmail)
  const { t } = useI18n()

  const loadDashboard = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const [incomeRes, expenseRes, timeRes] = await Promise.all([
        supabase.from('incomes').select('*').eq('company_id', currentCompany.id).order('date', { ascending: false }),
        supabase.from('expenses').select('*').eq('company_id', currentCompany.id).order('date', { ascending: false }),
        supabase.from('time_entries').select('*').eq('company_id', currentCompany.id).order('date', { ascending: false }),
      ])

      if (incomeRes.error) throw incomeRes.error
      if (expenseRes.error) throw expenseRes.error
      if (timeRes.error) throw timeRes.error

      setIncomes((incomeRes.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })))
      setExpenses((expenseRes.data ?? []).map((item) => ({ ...item, amount: Number(item.amount) })))
      setTimeEntries((timeRes.data ?? []).map((item) => ({ ...item, hours: Number(item.hours) })))
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
      setIncomes([])
      setExpenses([])
      setTimeEntries([])
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const loadAccountEmail = async () => {
      const { data } = await supabase.auth.getUser()
      setAccountEmail(data.user?.email ?? null)
    }

    void loadAccountEmail()
  }, [supabase])

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title={t('dashboard.title')} description={t('dashboard.loading')} />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('dashboard.title')} description={t('dashboard.noWorkspace')} />
        <EmptyState
          icon={Building2}
          title={t('common.noWorkspaceSelected')}
          description={t('dashboard.noWorkspace')}
          action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  const currency = currentCompany.currency ?? 'USD'
  const planLabel = accountAccess.plan === 'pro' ? 'Pro' : 'Free'
  const getDisplayAmount = (amount: number, itemCurrency: string, itemExchangeRate?: number, itemWorkspaceCurrency?: string) => {
    const savedWorkspaceCurrency = normalizeCurrencyCode(itemWorkspaceCurrency ?? currency)
    const savedAmount = getSavedAmountInWorkspaceCurrency({
      amount,
      transactionCurrency: itemCurrency,
      workspaceCurrency: savedWorkspaceCurrency,
      savedExchangeRate: itemExchangeRate ?? 1,
    })

    if (savedWorkspaceCurrency === currency) {
      return savedAmount
    }

    return convertToCurrency(savedAmount, savedWorkspaceCurrency, currency)
  }

  const totalIncome = incomes.reduce((sum, item) => sum + getDisplayAmount(Number(item.amount), item.currency ?? currency, item.exchange_rate, item.workspace_currency), 0)
  const totalExpenses = expenses.reduce((sum, item) => sum + getDisplayAmount(Number(item.amount), item.currency ?? currency, item.exchange_rate, item.workspace_currency), 0)
  const netIncome = totalIncome - totalExpenses
  const totalHours = timeEntries.reduce((sum, item) => sum + Number(item.hours), 0)

  const formatMoney = (value: number) => formatCurrency(value, currency)
  const formatHours = (hoursValue: number) => {
    const totalMinutes = Math.round(Math.max(0, hoursValue) * 60)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    const parts = []

    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)

    return parts.join(' ')
  }

  const filterByDate = <T extends { date: string }>(items: T[]) =>
    items.filter((item) => (!filterFromDate || item.date >= filterFromDate) && (!filterToDate || item.date <= filterToDate))

  const sortedIncomes = filterByDate(incomes).sort((left, right) => {
    const leftValue = sortBy === 'date' ? new Date(left.date).getTime() : Number(left.amount)
    const rightValue = sortBy === 'date' ? new Date(right.date).getTime() : Number(right.amount)
    return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
  })

  const sortedExpenses = filterByDate(expenses).sort((left, right) => {
    const leftValue = sortBy === 'date' ? new Date(left.date).getTime() : Number(left.amount)
    const rightValue = sortBy === 'date' ? new Date(right.date).getTime() : Number(right.amount)
    return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
  })

  const sortedTimeEntries = filterByDate(timeEntries).sort((left, right) => {
    const leftValue = new Date(left.date).getTime()
    const rightValue = new Date(right.date).getTime()
    return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue
  })

  const formatMonthHeading = (date: string) =>
    new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const renderGrouped = <T extends { id: string; date: string }>(
    items: T[],
    renderItem: (item: T) => React.ReactNode,
    empty: string,
  ) => {
    if (items.length === 0) return <p className="text-muted-foreground">{empty}</p>

    if (!groupByMonth) {
      return items.slice(0, 6).map(renderItem)
    }

    const groups = items.reduce<Record<string, T[]>>((acc, item) => {
      const month = item.date.slice(0, 7)
      acc[month] = [...(acc[month] ?? []), item]
      return acc
    }, {})

    return Object.entries(groups).map(([month, groupItems]) => (
      <div key={month} className="space-y-2">
        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{formatMonthHeading(`${month}-01`)}</p>
        {groupItems.slice(0, 6).map(renderItem)}
      </div>
    ))
  }

  return (
    <PageContainer>
      <PageHeader title={t('dashboard.title')} description={`${currentCompany.name} · ${currency}`}>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {planLabel} plan
        </span>
      </PageHeader>
      <div className="mb-6 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">{t('dashboard.filterFrom')}</span>
          <input type="date" value={filterFromDate} onChange={(event) => setFilterFromDate(event.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-600">{t('dashboard.filterTo')}</span>
          <input type="date" value={filterToDate} onChange={(event) => setFilterToDate(event.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <AppSelect
          value={groupByMonth ? 'month' : 'none'}
          onChange={(value) => setGroupByMonth(value === 'month')}
          options={[
            { value: 'none', label: t('common.noMonthGrouping') },
            { value: 'month', label: t('common.groupByMonth') },
          ]}
          className="self-end"
        />
        <AppSelect
          value={sortBy}
          onChange={(value) => setSortBy(value as 'date' | 'amount')}
          options={[
            { value: 'date', label: t('common.sortDate') },
            { value: 'amount', label: t('common.sortAmount') },
          ]}
          className="self-end"
        />
        <AppSelect
          value={sortDirection}
          onChange={(value) => setSortDirection(value as 'asc' | 'desc')}
          options={[
            { value: 'desc', label: t('common.descending') },
            { value: 'asc', label: t('common.ascending') },
          ]}
          className="self-end"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">{t('dashboard.totalIncome')}</h3>
          <p className="text-2xl">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">{t('dashboard.totalExpenses')}</h3>
          <p className="text-2xl">{formatMoney(totalExpenses)}</p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">{t('dashboard.netIncome')}</h3>
          <p className={`text-2xl ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoney(netIncome)}
          </p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">{t('dashboard.totalTime')}</h3>
          <p className="text-2xl">{formatHours(totalHours)}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-card p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">{t('dashboard.recentIncome')}</h3>
          </div>
          {renderGrouped(sortedIncomes, (income) => (
            <div key={income.id} className="flex justify-between border-b py-2">
              <span>{income.description}</span>
              <span>{formatMoney(getDisplayAmount(Number(income.amount), income.currency ?? currency, income.exchange_rate, income.workspace_currency))}</span>
            </div>
          ), t('dashboard.noIncome'))}
          <Link href="/income" className="mt-4 block text-center text-sm font-medium text-primary hover:underline">
            {t('dashboard.viewAllIncome')}
          </Link>
        </div>
        <div className="rounded-lg bg-card p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">{t('dashboard.recentExpenses')}</h3>
          </div>
          {renderGrouped(sortedExpenses, (expense) => (
            <div key={expense.id} className="flex justify-between border-b py-2">
              <span>{expense.description}</span>
              <span>{formatMoney(getDisplayAmount(Number(expense.amount), expense.currency ?? currency, expense.exchange_rate, expense.workspace_currency))}</span>
            </div>
          ), t('dashboard.noExpenses'))}
          <Link href="/expenses" className="mt-4 block text-center text-sm font-medium text-primary hover:underline">
            {t('dashboard.viewAllExpenses')}
          </Link>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">{t('dashboard.recentTime')}</h3>
          {renderGrouped(sortedTimeEntries, (entry) => (
            <div key={entry.id} className="flex justify-between border-b py-2">
              <span>{entry.description}</span>
              <span>{formatHours(Number(entry.hours))}</span>
            </div>
          ), t('dashboard.noTime'))}
        </div>
      </div>
    </PageContainer>
  )
}
