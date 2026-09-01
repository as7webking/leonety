'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Crown, RefreshCw } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'
import { getIntlLocale } from '@/lib/i18n'
import { appPlans, paidAppPlans, planDefinitions, type AppPlan, type PaidAppPlan } from '@/lib/billing/plans'
import type { AccountAccess } from '@/lib/account-access'

interface UpgradeContext {
  company: { id: string; name: string } | null
  currentPlan: AppPlan
  pendingRequest: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
  } | null
  isPro: boolean
  message?: string
}

const planFeatureKeys: Record<AppPlan, string[]> = {
  free: ['billing.feature.coreBookkeeping', 'billing.feature.oneWorkspace', 'billing.feature.freeLimits'],
  starter: ['billing.feature.coreBookkeeping', 'billing.feature.twoWorkspaces', 'billing.feature.basicInventory'],
  pro: ['billing.feature.unlimitedClients', 'billing.feature.invoices', 'billing.feature.storeIntegrations'],
  business: ['billing.feature.businessOps', 'billing.feature.advancedInventory', 'billing.feature.prioritySupport'],
}

function replaceVars(value: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement), value)
}

function formatPlanName(plan: AppPlan, t: (key: string) => string) {
  return t(`billing.plan.${plan}`)
}

export default function UpgradePage() {
  const [context, setContext] = useState<UpgradeContext | null>(null)
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingPlan, setSubmittingPlan] = useState<PaidAppPlan | null>(null)
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [billingAction, setBillingAction] = useState<'cancel' | 'portal' | null>(null)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { locale, t } = useI18n()

  const currencyFormatter = useMemo(() => new Intl.NumberFormat(getIntlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }), [locale])

  const formatDate = useCallback((date: string | null | undefined) => {
    if (!date) return ''
    return new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: 'medium' }).format(new Date(date))
  }, [locale])

  const loadUpgradeContext = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [upgradeResponse, accessResponse] = await Promise.all([
        fetch('/api/upgrade-request', { cache: 'no-store' }),
        fetch('/api/account/access', { cache: 'no-store' }),
      ])
      const upgradeData = await upgradeResponse.json()
      const accessData = await accessResponse.json()

      if (!upgradeResponse.ok) {
        throw new Error(upgradeData.error || t('billing.loadFailed'))
      }

      setContext(upgradeData)
      setAccountAccess(accessResponse.ok ? accessData.accountAccess ?? null : null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('billing.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadUpgradeContext()
  }, [loadUpgradeContext])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutState = params.get('checkout')

    if (checkoutState === 'success') {
      setSuccess(t('billing.paymentReceived'))
      setPolling(true)
    } else if (checkoutState === 'cancelled') {
      setSuccess(t('billing.checkoutCancelled'))
    }
  }, [t])

  useEffect(() => {
    if (!polling) return

    let cancelled = false
    let attempts = 0

    const poll = async () => {
      attempts += 1
      await loadUpgradeContext()

      if (cancelled) return
      if (attempts >= 8) {
        setPolling(false)
        return
      }

      window.setTimeout(() => {
        if (!cancelled) void poll()
      }, 2500)
    }

    void poll()

    return () => {
      cancelled = true
    }
  }, [loadUpgradeContext, polling])

  const startCheckout = async (plan: PaidAppPlan) => {
    if (!context?.company) {
      setError(t('billing.workspaceRequired'))
      return
    }

    setSubmittingPlan(plan)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: context.company.id,
          plan,
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.url) {
        throw new Error(data.error || t('billing.checkoutFailed'))
      }

      window.location.assign(data.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : t('billing.checkoutFailed'))
    } finally {
      setSubmittingPlan(null)
    }
  }

  const requestProAccess = async () => {
    setSubmittingRequest(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'User requested Pro access from the upgrade page.',
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('billing.manualRequestFailed'))
      }

      setContext(data)
      setSuccess(data.message || t('billing.manualRequestSent'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('billing.manualRequestFailed'))
    } finally {
      setSubmittingRequest(false)
    }
  }

  const scheduleCancellation = async () => {
    if (!context?.company) {
      setError(t('billing.workspaceRequired'))
      return
    }

    const confirmed = window.confirm(t('billing.cancelConfirm'))
    if (!confirmed) return

    setBillingAction('cancel')
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/billing/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: context.company.id }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('billing.cancelFailed'))
      }

      const periodMessage = data.currentPeriodEnd
        ? replaceVars(t('billing.cancelScheduledWithDate'), { date: formatDate(data.currentPeriodEnd) })
        : t('billing.cancelScheduled')
      setSuccess(periodMessage)
      await loadUpgradeContext()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : t('billing.cancelFailed'))
    } finally {
      setBillingAction(null)
    }
  }

  const openCustomerPortal = async () => {
    if (!context?.company) {
      setError(t('billing.workspaceRequired'))
      return
    }

    setBillingAction('portal')
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/billing/subscription/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: context.company.id }),
      })
      const data = await response.json()

      if (!response.ok || !data.url) {
        throw new Error(data.error || t('billing.portalFailed'))
      }

      window.location.assign(data.url)
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : t('billing.portalFailed'))
      setBillingAction(null)
    }
  }

  const currentPlan = accountAccess?.plan ?? context?.currentPlan ?? 'free'
  const trialEnd = accountAccess?.trialEndsAt ?? null
  const periodEnd = accountAccess?.currentPeriodEnd ?? null

  return (
    <PageContainer>
      <PageHeader
        title={t('billing.upgradeTitle')}
        description={t('billing.upgradeDescription')}
      />

      <div className="space-y-5">
        {loading && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
            {polling && <span className="ml-2">{t('billing.confirmingSubscription')}</span>}
          </div>
        )}

        <Card>
          <CardContent className="grid gap-3 p-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-slate-500">{t('workspaces.workspaceName')}</p>
              <p className="font-medium text-slate-950">{context?.company?.name ?? t('common.noWorkspaceSelected')}</p>
            </div>
            <div>
              <p className="text-slate-500">{t('billing.currentPlan')}</p>
              <p className="font-medium text-slate-950">{formatPlanName(currentPlan, t)}</p>
            </div>
            <div>
              <p className="text-slate-500">{t('billing.accessSource')}</p>
              <p className="font-medium text-slate-950">{t(`billing.source.${accountAccess?.overrideSource ?? 'default'}`)}</p>
            </div>
            <div>
              <p className="text-slate-500">{accountAccess?.status === 'trialing' ? t('billing.trialEnds') : t('billing.currentPeriodEnd')}</p>
              <p className="font-medium text-slate-950">{formatDate(trialEnd || periodEnd) || '-'}</p>
            </div>
            <div>
              <p className="text-slate-500">{t('billing.nextBillingDate')}</p>
              <p className="font-medium text-slate-950">{accountAccess?.cancelAtPeriodEnd ? t('billing.noRenewalScheduled') : formatDate(accountAccess?.nextBillingDate) || '-'}</p>
            </div>
            <div>
              <p className="text-slate-500">{t('billing.renewalStatus')}</p>
              <p className="font-medium text-slate-950">{accountAccess?.cancelAtPeriodEnd ? t('billing.cancellationScheduled') : t('billing.renewsAutomatically')}</p>
            </div>
          </CardContent>
        </Card>

        {accountAccess?.cancelAtPeriodEnd && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {replaceVars(t('billing.accessUntil'), { date: formatDate(periodEnd) || '-' })}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-4">
          {appPlans.map((plan) => {
            const definition = planDefinitions[plan]
            const isPaid = paidAppPlans.includes(plan as PaidAppPlan)
            const isCurrent = currentPlan === plan
            const isRecommended = Boolean(definition.recommended)
            const trialDate = new Date()
            trialDate.setDate(trialDate.getDate() + definition.trialDays)

            return (
              <Card key={plan} className={isRecommended ? 'border-blue-500 ring-1 ring-blue-100' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-xl">{formatPlanName(plan, t)}</CardTitle>
                    {isRecommended && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                        {t('billing.recommended')}
                      </span>
                    )}
                  </div>
                  <CardDescription>
                    {plan === 'free' ? t('billing.freeForever') : t('billing.sevenDayTrial')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <span className="text-3xl font-bold text-slate-950">{currencyFormatter.format(definition.monthlyPriceEur)}</span>
                    <span className="text-sm text-slate-500"> / {t('billing.perMonth')}</span>
                    {isPaid && (
                      <p className="mt-2 text-sm text-green-700">{t('billing.noChargeToday')}</p>
                    )}
                    {isPaid && (
                      <p className="text-xs text-slate-500">
                        {replaceVars(t('billing.cancelBefore'), { date: formatDate(trialDate.toISOString()) })}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 text-sm text-slate-700">
                    {planFeatureKeys[plan].map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span>{t(feature)}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <Button className="w-full" disabled>
                      {t('billing.currentPlan')}
                    </Button>
                  ) : isPaid ? (
                    <Button className="w-full" onClick={() => void startCheckout(plan as PaidAppPlan)} disabled={submittingPlan !== null || !context?.company}>
                      {submittingPlan === plan ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                      {t('billing.startTrial')}
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      {t('billing.continueFree')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{t('billing.manualFallbackTitle')}</CardTitle>
            <CardDescription>{t('billing.manualFallbackDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {context?.pendingRequest ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t('billing.manualRequestPending')}
              </div>
            ) : (
              <Button variant="outline" onClick={requestProAccess} disabled={submittingRequest || !context?.company}>
                {submittingRequest ? t('common.loading') : t('billing.requestManualPro')}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/app/profile">{t('billing.openProfile')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/dashboard">{t('billing.backDashboard')}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadUpgradeContext()} disabled={loading}>
              {t('billing.refreshStatus')}
            </Button>
            {accountAccess?.canManageSubscription && (
              <Button type="button" variant="outline" onClick={() => void openCustomerPortal()} disabled={billingAction !== null}>
                {billingAction === 'portal' ? t('common.loading') : t('billing.manageSubscription')}
              </Button>
            )}
            {accountAccess?.canCancelSubscription && (
              <Button type="button" variant="outline" onClick={() => void scheduleCancellation()} disabled={billingAction !== null}>
                {billingAction === 'cancel' ? t('common.loading') : t('billing.cancelSubscription')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
