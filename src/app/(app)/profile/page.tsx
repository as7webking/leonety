'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { profileUpdateSchema, formatValidationError } from '@/lib/validations'
import { useAccountAccess } from '@/hooks/use-account-access'
import { formatCategoryLabel, formatMonthLabel } from '@/lib/category-labels'
import { loadCompanyBranding, saveCompanyBranding } from '@/lib/company-branding'
import { convertToCurrency, currencyOptions, formatCurrency, normalizeCurrencyCode } from '@/lib/currency'
import { LanguageSwitcher } from '@/components/language-switcher'
import { AppSelect } from '@/components/app-select'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { useI18n } from '@/contexts/i18n-context'
import { LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, DollarSign, LogOut, BriefcaseBusiness } from 'lucide-react'

interface UserProfile {
  id: string
  profile_number?: number | null
  email: string
  full_name: string
  currency: string
  created_at: string
}

interface ManagedProfile {
  id: string
  email: string
  full_name: string
  created_at: string
  workspaceCount: number
  workspaceNames: string[]
  isAdmin: boolean
  isPro: boolean
  plan: 'free' | 'pro'
  subscriptionEndsAt: string | null
  subscriptionSource: 'default' | 'manual' | 'payment'
  subscriptionStatus: 'active' | 'canceled' | 'expired'
  isDeactivated: boolean
  lastSignInAt: string | null
}

interface UpgradeRequest {
  id: string
  user_id: string
  company_id: string
  requested_plan: 'pro'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  created_at: string
  company_name?: string
  user_email?: string
}

interface PrintableTransaction {
  id: string
  type: 'Income' | 'Expense'
  date: string
  description: string
  category: string
  amount: number
  currency: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCurrency, setWorkspaceCurrency] = useState('USD')
  const [workspaceLogo, setWorkspaceLogo] = useState('')
  const [workspaceAddress, setWorkspaceAddress] = useState('')
  const [workspaceEmail, setWorkspaceEmail] = useState('')
  const [workspaceIban, setWorkspaceIban] = useState('')
  const [workspaceBic, setWorkspaceBic] = useState('')
  const [workspaceTaxNumber, setWorkspaceTaxNumber] = useState('')
  const [message, setMessage] = useState('')
  const [managedProfiles, setManagedProfiles] = useState<ManagedProfile[]>([])
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [monthsByProfile, setMonthsByProfile] = useState<Record<string, number>>({})
  const [groupReportsByMonth, setGroupReportsByMonth] = useState(false)
  const [reportFromDate, setReportFromDate] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split('T')[0]
  })
  const [reportToDate, setReportToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [printTransactions, setPrintTransactions] = useState<PrintableTransaction[]>([])
  const [includeCategoryInPrint, setIncludeCategoryInPrint] = useState(true)
  const [invoiceNumberFormat, setInvoiceNumberFormat] = useState<'yy-seq' | 'yyyy-seq'>('yy-seq')
  const [invoiceNumberDigits, setInvoiceNumberDigits] = useState('3')
  const [isPreparingPrint, setIsPreparingPrint] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, refreshCompanies } = useCompany()
  const { accountAccess } = useAccountAccess(profile?.email)
  const { locale, t } = useI18n()
  const planLabel = accountAccess.plan === 'pro' ? 'Pro' : 'Free'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGroupReportsByMonth(window.localStorage.getItem('leonety-group-reports-by-month') === 'true')
      setIncludeCategoryInPrint(window.localStorage.getItem('leonety-include-category-in-print') !== 'false')
      setInvoiceNumberFormat(window.localStorage.getItem('leonety-invoice-number-format') === 'yyyy-seq' ? 'yyyy-seq' : 'yy-seq')
      setInvoiceNumberDigits(window.localStorage.getItem('leonety-invoice-number-digits') ?? '3')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const handleGroupReportsChange = (checked: boolean) => {
    setGroupReportsByMonth(checked)
    window.localStorage.setItem('leonety-group-reports-by-month', String(checked))
  }

  const handleIncludeCategoryInPrintChange = (checked: boolean) => {
    setIncludeCategoryInPrint(checked)
    window.localStorage.setItem('leonety-include-category-in-print', String(checked))
  }

  const handleInvoiceNumberFormatChange = (value: 'yy-seq' | 'yyyy-seq') => {
    setInvoiceNumberFormat(value)
    window.localStorage.setItem('leonety-invoice-number-format', value)
  }

  const handleInvoiceNumberDigitsChange = (value: string) => {
    setInvoiceNumberDigits(value)
    window.localStorage.setItem('leonety-invoice-number-digits', value)
  }

  useEffect(() => {
    const handleAfterPrint = () => setIsPreparingPrint(false)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, currency, created_at')
          .eq('id', user.id)
          .single()

        if (error) throw error

        const { data: numberData } = await supabase
          .from('profiles')
          .select('profile_number')
          .eq('id', user.id)
          .maybeSingle()

        setProfile({ ...data, profile_number: numberData?.profile_number ?? null })
        setFullName(data.full_name)
        setCurrency(normalizeCurrencyCode(data.currency))
        setPhone(typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '')
      } catch {
        setMessage('Error loading profile')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [supabase, router])

  useEffect(() => {
    if (currentCompany) {
      setWorkspaceName(currentCompany.name)
      setWorkspaceCurrency(normalizeCurrencyCode(currentCompany.currency ?? 'USD'))
      const branding = loadCompanyBranding(currentCompany.id)
      setWorkspaceLogo(branding.logo)
      setWorkspaceAddress(branding.address)
      setWorkspaceEmail(branding.email)
      setWorkspaceIban(branding.iban)
      setWorkspaceBic(branding.bic)
      setWorkspaceTaxNumber(branding.taxNumber)
    }
  }, [currentCompany])

  const persistWorkspaceBranding = (
    nextLogo = workspaceLogo,
    nextAddress = workspaceAddress,
    nextEmail = workspaceEmail,
    nextIban = workspaceIban,
    nextBic = workspaceBic,
    nextTaxNumber = workspaceTaxNumber
  ) => {
    if (!currentCompany) return
    saveCompanyBranding(currentCompany.id, {
      logo: nextLogo,
      address: nextAddress,
      email: nextEmail,
      iban: nextIban,
      bic: nextBic,
      taxNumber: nextTaxNumber,
    })
  }

  const handleWorkspaceLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('Error: Please choose an image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setWorkspaceLogo(result)
      persistWorkspaceBranding(result, workspaceAddress, workspaceEmail, workspaceIban, workspaceBic, workspaceTaxNumber)
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (!accountAccess.isAdmin) return

    let active = true

    const loadManagedProfiles = async () => {
      setAdminLoading(true)
      setAdminError('')

      try {
        const response = await fetch('/api/admin/access', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load managed profiles')
        }
        if (active) {
          setManagedProfiles(data.profiles ?? [])
          setUpgradeRequests(data.upgradeRequests ?? [])
        }
      } catch (error) {
        if (active) {
          setAdminError(error instanceof Error ? error.message : 'Failed to load admin controls')
        }
      } finally {
        if (active) {
          setAdminLoading(false)
        }
      }
    }

    void loadManagedProfiles()

    return () => {
      active = false
    }
  }, [accountAccess.isAdmin])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage('')

    try {
      const validationResult = profileUpdateSchema.safeParse({
        full_name: fullName,
        currency: currency,
      })

      if (!validationResult.success) {
        setMessage(formatValidationError(validationResult.error))
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          currency: currency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) throw error

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: { phone: phone.trim() || null },
      })
      if (authUpdateError) throw authUpdateError

      setMessage('Profile updated successfully!')
      setProfile(prev => prev ? {
        ...prev,
        full_name: fullName,
        currency: currency,
      } : null)

      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      if (error instanceof Error) {
        setMessage('Error: ' + error.message)
      } else {
        setMessage('Error updating profile')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch {
      setMessage('Error logging out')
    }
  }

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentCompany) {
      setMessage('No workspace selected')
      return
    }

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: workspaceName.trim() || currentCompany.name,
          currency: workspaceCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentCompany.id)

      if (error) throw error

      await refreshCompanies(currentCompany.id)
      persistWorkspaceBranding()
      setMessage('Workspace updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(error instanceof Error ? `Error: ${error.message}` : 'Error updating workspace')
    }
  }

  const handleAccessUpdate = async (
    targetUserId: string,
    makeAdmin: boolean,
    makePro: boolean,
    deactivateAccount?: boolean,
    noExpiry?: boolean,
    upgradeRequestId?: string,
    upgradeRequestStatus?: 'approved' | 'rejected'
  ) => {
    setAdminLoading(true)
    setMessage('')
    setAdminError('')

    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId,
          makeAdmin,
          makePro,
          deactivateAccount,
          noExpiry,
          upgradeRequestId,
          upgradeRequestStatus,
          monthsPaid: monthsByProfile[targetUserId] ?? 1,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update access')
      }

      setManagedProfiles(data.profiles ?? [])
      setUpgradeRequests(data.upgradeRequests ?? [])
      setMessage('Access updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(error instanceof Error ? `Error: ${error.message}` : 'Error updating access')
    } finally {
      setAdminLoading(false)
    }
  }

  const handleUpgradeRequestReview = async (request: UpgradeRequest, status: 'approved' | 'rejected') => {
    setAdminLoading(true)
    setMessage('')
    setAdminError('')

    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: request.user_id,
          ...(status === 'approved' ? { makePro: true, noExpiry: true } : {}),
          noExpiry: status === 'approved',
          upgradeRequestId: request.id,
          upgradeRequestStatus: status,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update upgrade request')
      }

      setManagedProfiles(data.profiles ?? [])
      setUpgradeRequests(data.upgradeRequests ?? [])
      setMessage(status === 'approved' ? 'Pro request approved.' : 'Pro request rejected.')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Failed to update upgrade request')
    } finally {
      setAdminLoading(false)
    }
  }

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied.`)
      setTimeout(() => setMessage(''), 2000)
    } catch {
      setMessage(`Error: failed to copy ${label.toLowerCase()}`)
    }
  }

  const getMonthsForProfile = (profileId: string) => monthsByProfile[profileId] ?? 1

  const setMonthsForProfile = (profileId: string, nextValue: number) => {
    setMonthsByProfile((prev) => ({
      ...prev,
      [profileId]: Math.max(1, nextValue),
    }))
  }

  const getTransactionAmountInAccountCurrency = (transaction: PrintableTransaction) =>
    convertToCurrency(transaction.amount, transaction.currency, normalizeCurrencyCode(currency))

  const renderTransactionPrintAmount = (transaction: PrintableTransaction) => {
    const accountCurrency = normalizeCurrencyCode(currency)
    const originalAmount = `${Number(transaction.amount).toFixed(2)} ${transaction.currency}`

    if (normalizeCurrencyCode(transaction.currency) === accountCurrency) {
      return originalAmount
    }

    return `${originalAmount} (${formatCurrency(getTransactionAmountInAccountCurrency(transaction), accountCurrency)})`
  }

  const getPrintMonthKey = (date: string) => date.slice(0, 7)

  const printMonthGroups = printTransactions.reduce<Record<string, PrintableTransaction[]>>((groups, transaction) => {
    const key = getPrintMonthKey(transaction.date)
    return {
      ...groups,
      [key]: [...(groups[key] ?? []), transaction],
    }
  }, {})

  const sortedPrintMonthGroups = Object.entries(printMonthGroups).sort(([left], [right]) => left.localeCompare(right))

  const getReportTitle = () => {
    if (sortedPrintMonthGroups.length === 1) {
      return formatMonthLabel(sortedPrintMonthGroups[0][0], locale)
    }

    return `${reportFromDate || '...'} - ${reportToDate || '...'}`
  }

  const escapeHtml = (value: string | number) =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const renderCompactPrintTransaction = (transaction: PrintableTransaction) => (
    <div className="break-inside-avoid space-y-1">
      <div className="flex justify-between gap-3">
        <span className="font-medium">{transaction.description}</span>
        <span className="whitespace-nowrap text-right font-semibold">{renderTransactionPrintAmount(transaction)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        <span>{transaction.date}</span>
        {includeCategoryInPrint && <span>{formatCategoryLabel(transaction.category, t)}</span>}
      </div>
    </div>
  )

  const renderMonthlyPrintSection = (monthKey: string, transactions: PrintableTransaction[]) => {
    const incomeTransactions = transactions.filter((transaction) => transaction.type === 'Income')
    const expenseTransactions = transactions.filter((transaction) => transaction.type === 'Expense')
    const rowCount = Math.max(incomeTransactions.length, expenseTransactions.length)

    return (
      <section key={monthKey} className="mb-6 break-inside-avoid">
        <h2 className="mb-3 text-lg font-semibold capitalize">{formatMonthLabel(monthKey, locale)}</h2>
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-1/2 border p-2 text-left">{t('income.title')}</th>
              <th className="w-1/2 border p-2 text-left">{t('expenses.title')}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, index) => (
              <tr key={`${monthKey}-${index}`}>
                <td className="border p-2 align-top">
                  {incomeTransactions[index] ? renderCompactPrintTransaction(incomeTransactions[index]) : null}
                </td>
                <td className="border p-2 align-top">
                  {expenseTransactions[index] ? renderCompactPrintTransaction(expenseTransactions[index]) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  const handlePrintTransactions = async () => {
    if (!currentCompany) {
      setMessage('No workspace selected')
      return
    }

    setIsPreparingPrint(true)
    setMessage('')

    try {
      if (!reportFromDate && !reportToDate) {
        setMessage('Select at least one report date.')
        setIsPreparingPrint(false)
        return
      }

      if (reportFromDate && reportToDate && reportFromDate > reportToDate) {
        setMessage('Report start date must be before the end date.')
        setIsPreparingPrint(false)
        return
      }

      let incomeQuery = supabase
        .from('incomes')
        .select('id, date, description, category, amount, currency')
        .eq('company_id', currentCompany.id)
      let expenseQuery = supabase
        .from('expenses')
        .select('id, date, description, category, amount, currency')
        .eq('company_id', currentCompany.id)

      if (reportFromDate) {
        incomeQuery = incomeQuery.gte('date', reportFromDate)
        expenseQuery = expenseQuery.gte('date', reportFromDate)
      }

      if (reportToDate) {
        incomeQuery = incomeQuery.lte('date', reportToDate)
        expenseQuery = expenseQuery.lte('date', reportToDate)
      }

      const [incomeRes, expenseRes] = await Promise.all([
        incomeQuery.order('date', { ascending: true }),
        expenseQuery.order('date', { ascending: true }),
      ])

      if (incomeRes.error) throw incomeRes.error
      if (expenseRes.error) throw expenseRes.error

      const transactions: PrintableTransaction[] = [
        ...((incomeRes.data ?? []) as Array<Omit<PrintableTransaction, 'type'>>).map((item) => ({
          ...item,
          type: 'Income' as const,
          amount: Number(item.amount),
        })),
        ...((expenseRes.data ?? []) as Array<Omit<PrintableTransaction, 'type'>>).map((item) => ({
          ...item,
          type: 'Expense' as const,
          amount: Number(item.amount),
        })),
      ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())

      if (transactions.length === 0) {
        setMessage('No transactions found for the selected period.')
        setIsPreparingPrint(false)
        return
      }

      setPrintTransactions(transactions)
      window.setTimeout(() => {
        const previousTitle = document.title
        document.title = ' '
        window.print()
        window.setTimeout(() => {
          document.title = previousTitle
        }, 500)
      }, 50)
    } catch (error) {
      setIsPreparingPrint(false)
      setMessage(error instanceof Error ? `Error: ${error.message}` : 'Error preparing print report')
    }
  }

  const buildWordReportHtml = () => {
    const sections = sortedPrintMonthGroups.map(([monthKey, transactions]) => {
      const incomeTransactions = transactions.filter((transaction) => transaction.type === 'Income')
      const expenseTransactions = transactions.filter((transaction) => transaction.type === 'Expense')
      const rowCount = Math.max(incomeTransactions.length, expenseTransactions.length)
      const rows = Array.from({ length: rowCount }).map((_, index) => {
        const renderCell = (transaction: PrintableTransaction | undefined) => {
          if (!transaction) return ''

          const category = includeCategoryInPrint
            ? `<div style="font-size:11px;color:#475569;">${escapeHtml(formatCategoryLabel(transaction.category, t))}</div>`
            : ''

          return `
            <strong>${escapeHtml(transaction.description)}</strong>
            <div>${escapeHtml(renderTransactionPrintAmount(transaction))}</div>
            <div style="font-size:11px;color:#475569;">${escapeHtml(transaction.date)}</div>
            ${category}
          `
        }

        return `
          <tr>
            <td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top;width:50%;">${renderCell(incomeTransactions[index])}</td>
            <td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top;width:50%;">${renderCell(expenseTransactions[index])}</td>
          </tr>
        `
      }).join('')

      return `
        <h2 style="font-size:18px;margin:0 0 12px;text-transform:capitalize;">${escapeHtml(formatMonthLabel(monthKey, locale))}</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr>
              <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;width:50%;">${escapeHtml(t('income.title'))}</th>
              <th style="border:1px solid #cbd5e1;padding:8px;text-align:left;width:50%;">${escapeHtml(t('expenses.title'))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `
    }).join('')

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Leonety report</title>
        </head>
        <body style="font-family:Arial,sans-serif;color:#0f172a;">
          <h1 style="font-size:22px;margin:0 0 16px;text-transform:capitalize;">${escapeHtml(getReportTitle())}</h1>
          ${sections}
        </body>
      </html>
    `
  }

  const handleDownloadTransactionsWord = () => {
    if (printTransactions.length === 0) {
      setMessage('Prepare a report before downloading Word.')
      return
    }

    const blob = new Blob([buildWordReportHtml()], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `leonety-transactions-${new Date().toISOString().split('T')[0]}.doc`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader
          title={t('profile.title')}
          description={t('common.loadingDescription')}
        />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!profile) {
    return (
      <PageContainer>
        <PageHeader
          title="Profile"
          description="Your account information"
        />
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-700">Unable to load your profile. Please try again later.</p>
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('profile.title')}
        description={t('profile.description')}
      />

      {isPreparingPrint && printTransactions.length > 0 && (
        <div className="print-area hidden">
          <div className="mb-4 flex items-start gap-3">
            {workspaceLogo ? (
              <img src={workspaceLogo} alt={currentCompany?.name ?? 'Workspace'} className="h-12 w-12 object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-600">
                {(currentCompany?.name ?? 'L').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold">{currentCompany?.name ?? 'Workspace'}</h1>
              <p className="text-sm text-slate-600 capitalize">{getReportTitle()}</p>
              {workspaceAddress && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{workspaceAddress}</p>}
            </div>
          </div>
          {sortedPrintMonthGroups.map(([monthKey, transactions]) => renderMonthlyPrintSection(monthKey, transactions))}
          <div className="mt-4 grid gap-2 border-t pt-3 text-sm font-semibold sm:grid-cols-2">
            <p>
              {t('income.title')} {t('common.total').toLowerCase()}: {formatCurrency(
                printTransactions
                  .filter((transaction) => transaction.type === 'Income')
                  .reduce((sum, transaction) => sum + getTransactionAmountInAccountCurrency(transaction), 0),
                normalizeCurrencyCode(currency),
              )}
            </p>
            <p className="sm:text-right">
              {t('expenses.title')} {t('common.total').toLowerCase()}: {formatCurrency(
                printTransactions
                  .filter((transaction) => transaction.type === 'Expense')
                  .reduce((sum, transaction) => sum + getTransactionAmountInAccountCurrency(transaction), 0),
                normalizeCurrencyCode(currency),
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid w-full gap-6 lg:grid-cols-2">
        {/* Profile Information Card */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('profile.accountInformation')}
            </CardTitle>
            <CardDescription>{t('profile.accountInformationDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {message && (
                <div className={`p-3 rounded-md text-sm ${
                  message.includes('Error')
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {message}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">{t('profile.fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('profile.phone')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+49 ..."
                />
                <p className="mt-1 text-xs text-gray-500">{t('profile.phoneHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t('profile.emailAddress')}
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('profile.emailLocked')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {t('profile.defaultCurrency')}
                </label>
                <AppSelect
                  value={currency}
                  onChange={(value) => setCurrency(normalizeCurrencyCode(value))}
                  options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                />
              </div>

              <div className="pt-4 border-t">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? t('profile.saving') : t('common.saveChanges')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              {t('profile.currentWorkspace')}
            </CardTitle>
            <CardDescription>{t('profile.currentWorkspaceDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentCompany ? (
              <form onSubmit={handleSaveWorkspace} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('profile.workspaceName')}</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Workspace name"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('profile.workspaceType')}</label>
                    <input
                      type="text"
                      value={currentCompany.type}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed capitalize"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('profile.workspaceCurrency')}</label>
                    <AppSelect
                      value={workspaceCurrency}
                      onChange={(value) => setWorkspaceCurrency(normalizeCurrencyCode(value))}
                      options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('profile.currentPlanInline').replace('{plan}', planLabel)}
                </div>

                <div className="space-y-3 rounded-md border border-slate-200 p-4">
                  <div className="flex items-center gap-4">
                    {workspaceLogo ? (
                      <img src={workspaceLogo} alt={workspaceName || 'Workspace logo'} className="h-14 w-14 rounded-md object-contain" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-slate-100 text-lg font-semibold text-slate-500">
                        {(workspaceName || currentCompany.name).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <label className="block text-sm font-medium">{t('profile.companyLogo')}</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleWorkspaceLogoChange}
                        className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                      />
                    </div>
                    {workspaceLogo && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setWorkspaceLogo('')
                          persistWorkspaceBranding('', workspaceAddress, workspaceEmail, workspaceIban, workspaceBic, workspaceTaxNumber)
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                  <div className="block space-y-1">
                    <span className="text-sm font-medium">{t('profile.companyAddress')}</span>
                    <AddressAutocomplete
                      onSelect={(suggestion) => {
                        const nextAddress = [
                          [suggestion.street, suggestion.houseNumber].filter(Boolean).join(' '),
                          [suggestion.postalCode, suggestion.city].filter(Boolean).join(' '),
                          suggestion.state,
                          suggestion.country,
                        ].filter(Boolean).join('\n')
                        setWorkspaceAddress(nextAddress)
                        persistWorkspaceBranding(workspaceLogo, nextAddress, workspaceEmail, workspaceIban, workspaceBic, workspaceTaxNumber)
                      }}
                    />
                    <textarea
                      value={workspaceAddress}
                      onChange={(event) => {
                        setWorkspaceAddress(event.target.value)
                        persistWorkspaceBranding(workspaceLogo, event.target.value, workspaceEmail, workspaceIban, workspaceBic, workspaceTaxNumber)
                      }}
                      className="min-h-20 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder={t('profile.companyAddressPlaceholder')}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">{t('profile.companyEmail')}</span>
                      <input
                        type="email"
                        value={workspaceEmail}
                        onChange={(event) => {
                          setWorkspaceEmail(event.target.value)
                          persistWorkspaceBranding(workspaceLogo, workspaceAddress, event.target.value, workspaceIban, workspaceBic, workspaceTaxNumber)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="company@example.com"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">{t('profile.companyIban')}</span>
                      <input
                        value={workspaceIban}
                        onChange={(event) => {
                          setWorkspaceIban(event.target.value)
                          persistWorkspaceBranding(workspaceLogo, workspaceAddress, workspaceEmail, event.target.value, workspaceBic, workspaceTaxNumber)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="DE00 0000 0000 0000 0000 00"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">{t('profile.companyBic')}</span>
                      <input
                        value={workspaceBic}
                        onChange={(event) => {
                          setWorkspaceBic(event.target.value)
                          persistWorkspaceBranding(workspaceLogo, workspaceAddress, workspaceEmail, workspaceIban, event.target.value, workspaceTaxNumber)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="GENODEF1..."
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">{t('profile.companyTaxNumber')}</span>
                      <input
                        value={workspaceTaxNumber}
                        onChange={(event) => {
                          setWorkspaceTaxNumber(event.target.value)
                          persistWorkspaceBranding(workspaceLogo, workspaceAddress, workspaceEmail, workspaceIban, workspaceBic, event.target.value)
                        }}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Tax number / VAT ID"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className="w-full">{t('profile.saveWorkspace')}</Button>
                  <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/app/workspaces')}>
                    {t('profile.manageWorkspaces')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {t('profile.completeOnboarding')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('profile.accountDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">{t('profile.language')}</span>
              <LanguageSwitcher />
            </div>
            <div className="flex items-center justify-between gap-4 border-b py-2">
              <div>
                <span className="text-sm text-gray-600">{t('profile.reportSettings')}</span>
                <p className="text-xs text-gray-500">{t('profile.groupReportsByMonth')}</p>
              </div>
              <input
                type="checkbox"
                checked={groupReportsByMonth}
                onChange={(event) => handleGroupReportsChange(event.target.checked)}
                className="h-4 w-4"
                aria-label={t('profile.groupReportsByMonth')}
              />
            </div>
            <div className="space-y-3 border-b py-2">
              <div>
                <span className="text-sm text-gray-600">{t('profile.invoiceNumberSettings')}</span>
                <p className="text-xs text-gray-500">{t('profile.invoiceNumberSettingsDescription')}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">{t('profile.invoiceNumberFormat')}</span>
                  <AppSelect
                    value={invoiceNumberFormat}
                    onChange={(value) => handleInvoiceNumberFormatChange(value as 'yy-seq' | 'yyyy-seq')}
                    options={[
                      { value: 'yy-seq', label: '26-001' },
                      { value: 'yyyy-seq', label: '2026-001' },
                    ]}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-500">{t('profile.invoiceNumberDigits')}</span>
                  <AppSelect
                    value={invoiceNumberDigits}
                    onChange={handleInvoiceNumberDigitsChange}
                    options={[
                      { value: '3', label: '001' },
                      { value: '4', label: '0001' },
                      { value: '5', label: '00001' },
                    ]}
                  />
                </label>
              </div>
            </div>
            <div className="space-y-3 border-b py-2">
              <div>
                <span className="text-sm text-gray-600">{t('profile.printTransactions')}</span>
                <p className="text-xs text-gray-500">{t('profile.printTransactionsDescription')}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <input
                  type="date"
                  value={reportFromDate}
                  onChange={(event) => setReportFromDate(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                  aria-label={t('common.from')}
                />
                <input
                  type="date"
                  value={reportToDate}
                  onChange={(event) => setReportToDate(event.target.value)}
                  className="rounded-md border px-3 py-2 text-sm"
                  aria-label={t('common.to')}
                />
                <Button type="button" variant="outline" onClick={handlePrintTransactions}>
                  {isPreparingPrint ? 'Preparing...' : t('common.printSavePdf')}
                </Button>
                <Button type="button" variant="outline" onClick={handleDownloadTransactionsWord}>
                  {t('common.downloadWord')}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includeCategoryInPrint}
                  onChange={(event) => handleIncludeCategoryInPrintChange(event.target.checked)}
                  className="h-4 w-4"
                />
                {t('profile.includeCategoryInPrint')}
              </label>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">{t('profile.currentPlan')}</span>
              <span className="text-sm font-medium">{planLabel}</span>
            </div>
            <div className="flex items-start justify-between gap-4 border-b py-2">
              <div className="w-full space-y-3">
                <span className="text-sm text-gray-600">{t('profile.whatsappTitle')}</span>
                <p className="text-xs text-gray-500">{t('profile.whatsappDescription')}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>{t('profile.whatsappBusinessNumber')}</span>
                    <input disabled className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm" placeholder="+49 ..." />
                  </label>
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>{t('profile.whatsappPhoneNumberId')}</span>
                    <input disabled className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm" placeholder="Meta Phone Number ID" />
                  </label>
                  <label className="space-y-1 text-xs text-slate-500">
                    <span>{t('profile.whatsappWebhook')}</span>
                    <input disabled className="w-full rounded-md border bg-slate-50 px-3 py-2 text-sm" value="/api/whatsapp/webhook" readOnly />
                  </label>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {t('profile.whatsappStatus')}
                </span>
                <Button type="button" variant="outline" size="sm" disabled>
                  {t('profile.whatsappComingSoon')}
                </Button>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">{t('profile.accountCreated')}</span>
              <span className="text-sm font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">{t('profile.accountId')}</span>
              <span className="text-xs font-mono text-gray-500 truncate max-w-xs">
                {profile.profile_number ?? profile.id}
              </span>
            </div>
          </CardContent>
        </Card>

        {accountAccess.isAdmin && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('profile.adminAccessManagement')}</CardTitle>
              <CardDescription>{t('profile.adminAccessDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {adminError}
                </div>
              )}
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{t('profile.upgradeRequests')}</p>
                    <p className="text-sm text-slate-500">{t('profile.upgradeRequestsDescription')}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {upgradeRequests.length}
                  </span>
                </div>
                {upgradeRequests.length === 0 ? (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{t('profile.noUpgradeRequests')}</p>
                ) : (
                  <div className="space-y-3">
                    {upgradeRequests.map((request) => (
                      <div key={request.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">{request.user_email || request.user_id}</p>
                          <p className="text-sm text-slate-500">
                            {request.company_name || request.company_id} · Pro · {new Date(request.created_at).toLocaleDateString()}
                          </p>
                          {request.message && <p className="text-sm text-slate-600">{request.message}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" disabled={adminLoading} onClick={() => void handleUpgradeRequestReview(request, 'approved')}>
                            {t('profile.approvePro')}
                          </Button>
                          <Button type="button" variant="outline" disabled={adminLoading} onClick={() => void handleUpgradeRequestReview(request, 'rejected')}>
                            {t('profile.rejectRequest')}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {adminLoading && managedProfiles.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('profile.loadingProfiles')}
                </div>
              ) : managedProfiles.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('profile.noProfilesFound')}
                </div>
              ) : (
                managedProfiles.map((managedProfile) => {
                  const isCurrentUser = managedProfile.id === profile.id

                  return (
                    <div key={managedProfile.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {managedProfile.full_name || managedProfile.email}
                          </p>
                          <p className="text-sm text-slate-500">{managedProfile.email}</p>
                          <p className="text-sm text-slate-500">
                            Subscription: {managedProfile.plan.toUpperCase()}
                            {managedProfile.isPro
                              ? managedProfile.subscriptionEndsAt
                                ? ` · until ${new Date(managedProfile.subscriptionEndsAt).toLocaleDateString()}`
                                : ' · no expiry'
                              : ''}
                          </p>
                          <p className="text-sm text-slate-500">
                            Source: {managedProfile.subscriptionSource} · Status: {managedProfile.subscriptionStatus}
                          </p>
                          <p className="text-sm text-slate-500">
                            Account: {managedProfile.isDeactivated ? 'Deactivated' : 'Active'}
                            {managedProfile.lastSignInAt
                              ? ` · last sign-in ${new Date(managedProfile.lastSignInAt).toLocaleDateString()}`
                              : ''}
                          </p>
                          <p className="text-sm text-slate-500">
                            Workspaces: {managedProfile.workspaceCount}
                            {managedProfile.workspaceNames.length > 0 ? ` · ${managedProfile.workspaceNames.join(', ')}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.isAdmin ? 'Admin' : 'User'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.isPro ? 'Pro' : 'Free'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.subscriptionSource === 'payment' ? 'Paid automatically' : 'Manual access'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${
                              managedProfile.isDeactivated
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {managedProfile.isDeactivated ? 'Deactivated' : 'Active account'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading}
                            onClick={() => handleCopy(managedProfile.email, 'Email')}
                          >
                            Copy Email
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading}
                            onClick={() => handleCopy(managedProfile.id, 'User ID')}
                          >
                            Copy ID
                          </Button>
                          <div
                            className="inline-flex items-center overflow-hidden rounded-md border border-gray-300 bg-white text-sm"
                            aria-label={`Months for ${managedProfile.email}`}
                          >
                            <button
                              type="button"
                              className="px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={adminLoading || getMonthsForProfile(managedProfile.id) <= 1}
                              onClick={() => setMonthsForProfile(managedProfile.id, getMonthsForProfile(managedProfile.id) - 1)}
                            >
                              -
                            </button>
                            <span className="min-w-20 border-x border-gray-300 px-3 py-2 text-center text-slate-700">
                              {getMonthsForProfile(managedProfile.id)} month{getMonthsForProfile(managedProfile.id) === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              className="px-3 py-2 text-slate-700 hover:bg-slate-50"
                              disabled={adminLoading}
                              onClick={() => setMonthsForProfile(managedProfile.id, getMonthsForProfile(managedProfile.id) + 1)}
                            >
                              +
                            </button>
                          </div>
                          {managedProfile.subscriptionSource !== 'payment' && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={adminLoading}
                              onClick={() => handleAccessUpdate(managedProfile.id, managedProfile.isAdmin, !managedProfile.isPro)}
                            >
                              {managedProfile.isPro ? 'Remove Pro' : 'Grant Pro'}
                            </Button>
                          )}
                          {managedProfile.subscriptionSource === 'payment' && (
                            <span className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                              Paid subscription
                            </span>
                          )}
                          {!managedProfile.isPro && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={adminLoading}
                              onClick={() => handleAccessUpdate(managedProfile.id, managedProfile.isAdmin, true, undefined, true)}
                            >
                              Grant Pro now
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading || isCurrentUser}
                            onClick={() => handleAccessUpdate(managedProfile.id, !managedProfile.isAdmin, managedProfile.isPro)}
                          >
                            {managedProfile.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading || isCurrentUser}
                            onClick={() =>
                              handleAccessUpdate(
                                managedProfile.id,
                                managedProfile.isAdmin,
                                managedProfile.isPro,
                                !managedProfile.isDeactivated
                              )
                            }
                          >
                            {managedProfile.isDeactivated ? 'Reactivate' : 'Deactivate'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* Logout */}
        <Card className="border-red-200 bg-red-50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-red-700">Sign Out</CardTitle>
            <CardDescription className="text-red-600">
              End your current session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full text-red-700 border-red-200 hover:bg-red-100"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
