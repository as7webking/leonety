'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader, EmptyState, LoadingSkeleton } from '@/components'
import { createClient } from '@/lib/supabase-client'
import { convertToCurrency, formatCurrency, getSavedAmountInWorkspaceCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { useCompany } from '@/contexts/company-context'
import { useAccountAccess } from '@/hooks/use-account-access'
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
  const { accountAccess } = useAccountAccess(accountEmail)

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
        <PageHeader title="Dashboard" description="Loading your workspace data" />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title="Dashboard" description="Create a workspace to get started" />
        <EmptyState
          icon={Building2}
          title="No workspace selected"
          description="Finish onboarding to create your first personal or business workspace."
          action={{ label: 'Go to onboarding', onClick: () => router.push('/onboarding') }}
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

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description={`${currentCompany.name} · ${currency}`}>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          {planLabel} plan
        </span>
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">Total Income</h3>
          <p className="text-2xl">{formatMoney(totalIncome)}</p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">Total Expenses</h3>
          <p className="text-2xl">{formatMoney(totalExpenses)}</p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">Net Income</h3>
          <p className={`text-2xl ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoney(netIncome)}
          </p>
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="text-lg font-semibold">Total Time</h3>
          <p className="text-2xl">{formatHours(totalHours)}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Incomes</h3>
          {incomes.slice(0, 3).map((income) => (
            <div key={income.id} className="flex justify-between border-b py-2">
              <span>{income.description}</span>
              <span>{formatMoney(getDisplayAmount(Number(income.amount), income.currency ?? currency, income.exchange_rate, income.workspace_currency))}</span>
            </div>
          ))}
          {incomes.length === 0 && <p className="text-muted-foreground">No incomes yet</p>}
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Expenses</h3>
          {expenses.slice(0, 3).map((expense) => (
            <div key={expense.id} className="flex justify-between border-b py-2">
              <span>{expense.description}</span>
              <span>{formatMoney(getDisplayAmount(Number(expense.amount), expense.currency ?? currency, expense.exchange_rate, expense.workspace_currency))}</span>
            </div>
          ))}
          {expenses.length === 0 && <p className="text-muted-foreground">No expenses yet</p>}
        </div>
        <div className="rounded-lg bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Time Entries</h3>
          {timeEntries.slice(0, 3).map((entry) => (
            <div key={entry.id} className="flex justify-between border-b py-2">
              <span>{entry.description}</span>
              <span>{formatHours(Number(entry.hours))}</span>
            </div>
          ))}
          {timeEntries.length === 0 && <p className="text-muted-foreground">No time entries yet</p>}
        </div>
      </div>
    </PageContainer>
  )
}
