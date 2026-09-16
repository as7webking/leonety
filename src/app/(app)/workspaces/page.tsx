'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import type { AccountAccess } from '@/lib/account-access'
import { paidAppPlans, planDefinitions } from '@/lib/billing/plans'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { Plus, Trash2 } from 'lucide-react'
import { AppSelect } from '@/components/app-select'
import { useI18n } from '@/contexts/i18n-context'
import { getIntlLocale } from '@/lib/i18n'

type WorkspaceType = 'personal' | 'business'

interface WorkspaceEntitlement {
  accountAccess: AccountAccess
  workspaceCount: number
  canCreate: boolean
}

type RelatedCount = {
  label: string
  table: 'incomes' | 'expenses' | 'time_entries' | 'active_timers'
}

const relatedTables: RelatedCount[] = [
  { label: 'income records', table: 'incomes' },
  { label: 'expense records', table: 'expenses' },
  { label: 'time entries', table: 'time_entries' },
  { label: 'active timers', table: 'active_timers' },
]

export default function WorkspacesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { locale, t } = useI18n()
  const { companies, currentCompanyId, loading, setCurrentCompanyId, refreshCompanies } = useCompany()
  const [userId, setUserId] = useState<string | null>(null)
  const [profileCurrency, setProfileCurrency] = useState('USD')
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('personal')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCurrency, setWorkspaceCurrency] = useState('USD')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [entitlement, setEntitlement] = useState<WorkspaceEntitlement | null>(null)
  const [entitlementLoading, setEntitlementLoading] = useState(false)
  const [showCreatePanel, setShowCreatePanel] = useState(false)

  const currentWorkspaceName = useMemo(
    () => companies.find((company) => company.id === currentCompanyId)?.name ?? t('nav.noWorkspace'),
    [companies, currentCompanyId, t],
  )

  useEffect(() => {
    const loadUserContext = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user

      if (!user) {
        setUserId(null)
        router.replace('/login')
        return
      }

      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('currency')
        .eq('id', user.id)
        .maybeSingle()

      const nextCurrency = normalizeCurrencyCode(profile?.currency ?? 'USD')
      setProfileCurrency(nextCurrency)
      setWorkspaceCurrency(nextCurrency)
    }

    void loadUserContext()
  }, [router, supabase])

  const loadEntitlement = async () => {
    setEntitlementLoading(true)
    try {
      const response = await fetch('/api/workspaces', { cache: 'no-store' })
      const data = await response.json().catch(() => ({})) as WorkspaceEntitlement & { error?: string }
      if (!response.ok) throw new Error(data.error || 'entitlement_lookup_failed')
      setEntitlement(data)
      return data
    } finally {
      setEntitlementLoading(false)
    }
  }

  useEffect(() => {
    if (loading) return
    const requestedCreate = new URLSearchParams(window.location.search).get('create') === '1'
    if (companies.length === 0 || requestedCreate) {
      setShowCreatePanel(true)
      void loadEntitlement().catch(() => setMessage(t('workspaces.entitlementLoadFailed')))
    }
  }, [companies.length, loading, t])

  const handleAddWorkspace = async () => {
    setMessage('')
    setShowCreatePanel(true)
    try {
      await loadEntitlement()
    } catch {
      setMessage(t('workspaces.entitlementLoadFailed'))
    }
  }

  const handleCreateWorkspace = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)

    try {
      if (!userId) {
        setMessage(t('workspaces.signInCreate'))
        return
      }

      const trimmedName = workspaceName.trim()

      if (workspaceType === 'business' && !trimmedName) {
        setMessage(t('workspaces.companyNameRequired'))
        return
      }

      const name = trimmedName || t('workspaces.personalWorkspace')
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type: workspaceType,
          currency: normalizeCurrencyCode(workspaceCurrency || profileCurrency),
        }),
      })
      const data = await response.json().catch(() => ({})) as { id?: string; error?: string }
      if (!response.ok || !data.id) {
        if (data.error === 'workspace_limit_reached') {
          await loadEntitlement()
          setMessage(t('workspaces.limitReached'))
          return
        }
        if (data.error === 'company_name_required') {
          setMessage(t('workspaces.companyNameRequired'))
          return
        }
        throw new Error(data.error || 'workspace_create_failed')
      }

      setWorkspaceName('')
      setWorkspaceType('personal')
      await refreshCompanies(data.id)
      await loadEntitlement()
      setShowCreatePanel(false)
      setMessage(t('workspaces.created'))
    } catch (error) {
      console.error('[workspaces] create request failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      setMessage(t('workspaces.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const getBlockingReason = async (companyId: string) => {
    const counts = await Promise.all(
      relatedTables.map(async (item) => {
        const { count, error } = await supabase
          .from(item.table)
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)

        if (error) throw error

        return { label: item.label, count: count ?? 0 }
      }),
    )

    return counts.filter((item) => item.count > 0)
  }

  const handleDeleteWorkspace = async (companyId: string) => {
    setMessage('')
    setDeletingId(companyId)

    try {
      if (!userId) {
        setMessage(t('workspaces.signInDelete'))
        return
      }

      if (companies.length <= 1) {
        setMessage(t('workspaces.cannotDeleteLast'))
        return
      }

      const blockingCounts = await getBlockingReason(companyId)

      if (blockingCounts.length > 0) {
        const details = blockingCounts.map((item) => `${item.count} ${item.label}`).join(', ')
        setMessage(t('workspaces.deleteBlocked').replace('{details}', details))
        setConfirmDeleteId(null)
        return
      }

      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId)
        .eq('owner_id', userId)

      if (error) throw error

      const nextWorkspaceId = companies.find((company) => company.id !== companyId)?.id ?? null
      await refreshCompanies(nextWorkspaceId)
      setConfirmDeleteId(null)
      setMessage(t('workspaces.deleted'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('workspaces.deleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('workspaces.title')}
        description={`${t('workspaces.currentWorkspace')}: ${currentWorkspaceName}`}
      />

      {companies.length > 0 && !showCreatePanel && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void handleAddWorkspace()} disabled={entitlementLoading}>
            <Plus className="mr-2 h-4 w-4" />
            {t('nav.addWorkspace')}
          </Button>
        </div>
      )}

      <div className={`grid gap-6 ${showCreatePanel ? 'lg:grid-cols-[1.4fr_0.9fr]' : ''}`}>
        <div className="space-y-4">
          {message && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('workspaces.yourWorkspaces')}</CardTitle>
              <CardDescription>{t('workspaces.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('workspaces.loading')}
                </div>
              ) : companies.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('workspaces.empty')}
                </div>
              ) : (
                companies.map((company) => {
                  const isCurrent = company.id === currentCompanyId
                  const isConfirming = confirmDeleteId === company.id

                  return (
                    <div key={company.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-slate-900">{company.name}</h2>
                            {isCurrent && (
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white">{t('workspaces.current')}</span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">
                              {company.type === 'business' ? t('workspaces.businessWorkspace') : t('workspaces.personalWorkspace')}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500">
                            {t('workspaces.createdAt')} {new Intl.DateTimeFormat(getIntlLocale(locale)).format(new Date(company.created_at))} · {company.currency ?? 'USD'}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isCurrent}
                            onClick={() => {
                              setCurrentCompanyId(company.id)
                              setMessage(t('workspaces.switched'))
                            }}
                          >
                            {t('workspaces.switchWorkspace')}
                          </Button>
                          {isConfirming ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={deletingId === company.id}
                                onClick={() => handleDeleteWorkspace(company.id)}
                              >
                                {t('workspaces.confirmDelete')}
                              </Button>
                              <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                                {t('common.cancel')}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={companies.length <= 1 || deletingId === company.id}
                              onClick={() => setConfirmDeleteId(company.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('common.delete')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {showCreatePanel && <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{t('workspaces.createWorkspace')}</CardTitle>
                  <CardDescription>{t('workspaces.createDescription')}</CardDescription>
                </div>
                {companies.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowCreatePanel(false)}>
                    {t('common.cancel')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {entitlementLoading || !entitlement ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {t('workspaces.checkingEntitlement')}
                </div>
              ) : !entitlement.canCreate ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-medium">{t('workspaces.limitReachedTitle')}</p>
                    <p className="mt-1">{t('workspaces.limitReached')}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs uppercase text-slate-500">{t('billing.currentPlan')}</p>
                      <p className="mt-1 font-semibold text-slate-950">{t(`billing.plan.${entitlement.accountAccess.plan}`)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-3">
                      <p className="text-xs uppercase text-slate-500">{t('workspaces.usage')}</p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {entitlement.workspaceCount} / {entitlement.accountAccess.workspaceLimit ?? t('workspaces.unlimited')}
                      </p>
                    </div>
                  </div>
                  {entitlement.accountAccess.status === 'trialing' && entitlement.accountAccess.trialEndsAt && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                      {t('workspaces.trialRemaining')
                        .replace('{days}', String(Math.max(0, Math.ceil((new Date(entitlement.accountAccess.trialEndsAt).getTime() - Date.now()) / 86_400_000))))
                        .replace('{date}', new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: 'medium' }).format(new Date(entitlement.accountAccess.trialEndsAt)))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-900">{t('workspaces.availablePlans')}</p>
                    {paidAppPlans.map((plan) => {
                      const definition = planDefinitions[plan]
                      return (
                        <div key={plan} className="flex flex-col gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <span className="font-medium">{t(`billing.plan.${plan}`)}</span>
                          <span className="text-slate-600">
                            {definition.workspaceLimit === null
                              ? t('workspaces.unlimited')
                              : t('workspaces.workspaceLimitValue').replace('{count}', String(definition.workspaceLimit))} · {definition.monthlyPriceEur.toLocaleString(getIntlLocale(locale), { style: 'currency', currency: 'EUR' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <Button asChild>
                    <Link href="/upgrade">{t('workspaces.changePlan')}</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">{t('workspaces.type')}</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(['personal', 'business'] as WorkspaceType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setWorkspaceType(type)}
                          className={`rounded-md border px-3 py-3 text-left text-sm capitalize ${
                            workspaceType === type ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                          }`}
                        >
                          {type === 'business' ? t('workspaces.businessWorkspace') : t('workspaces.personalWorkspace')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">
                      {workspaceType === 'business' ? t('workspaces.companyName') : t('workspaces.workspaceName')}
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                      className="w-full rounded-md border px-3 py-2"
                      placeholder={workspaceType === 'business' ? 'Acme Studio LLC' : t('workspaces.personalWorkspace')}
                      required={workspaceType === 'business'}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">{t('workspaces.currency')}</label>
                    <AppSelect
                      value={workspaceCurrency}
                      onChange={(value) => setWorkspaceCurrency(normalizeCurrencyCode(value))}
                      options={currencyOptions.map((option) => ({ value: option.code, label: `${option.code} - ${option.label}` }))}
                    />
                  </div>

                  <Button type="submit" disabled={submitting}>
                    <Plus className="mr-2 h-4 w-4" />
                    {submitting ? t('workspaces.creating') : t('workspaces.createWorkspace')}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>}
      </div>
    </PageContainer>
  )
}
