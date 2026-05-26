'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, Building2 } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCategoryLabel } from '@/lib/category-labels'
import { formatCurrency, normalizeCurrencyCode } from '@/lib/currency'
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

export default function TransactionsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadTransactions = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')

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
          title="No workspace selected"
          description="Create your first workspace before viewing transactions."
          action={{ label: 'Go to onboarding', onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('transactions.title')} description={`${t('transactions.description')} · ${currentCompany.name}`} />

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{errorMessage}</div>
      )}

      {transactions.length === 0 ? (
        <EmptyState title={t('common.noTransactions')} description="Add income or expenses to see them here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[auto_1fr_auto] gap-3 border-b bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 md:grid-cols-[auto_1fr_160px_160px]">
            <span>Type</span>
            <span>{t('common.description')}</span>
            <span className="hidden md:block">{t('common.category')}</span>
            <span className="text-right">{t('common.amount')}</span>
          </div>
          {transactions.map((transaction) => {
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
