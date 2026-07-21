'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader } from "@/components"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { canCreateWorkspace } from '@/lib/account-access'
import { useAccountAccess } from '@/hooks/use-account-access'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { useI18n } from '@/contexts/i18n-context'
import { AppSelect } from '@/components/app-select'

export default function OnboardingPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { companies, loading, refreshCompanies } = useCompany()
  const [workspaceType, setWorkspaceType] = useState<'personal' | 'business'>('personal')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCurrency, setWorkspaceCurrency] = useState('USD')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [accountEmail, setAccountEmail] = useState<string | null>(null)

  const { accountAccess } = useAccountAccess(accountEmail)
  const { t } = useI18n()
  useEffect(() => {
    const loadAccountContext = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      const email = user?.email ?? null
      setAccountEmail(email)

      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('currency')
        .eq('id', user.id)
        .maybeSingle()

      setWorkspaceCurrency(normalizeCurrencyCode(profile?.currency ?? 'USD'))
    }

    void loadAccountContext()
  }, [supabase])

  useEffect(() => {
    if (!loading && !canCreateWorkspace(companies.length, accountAccess)) {
      setMessage(t('workspaces.limitReached'))
    } else if (!loading) {
      setMessage('')
    }
  }, [accountAccess, companies.length, loading, router, t])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')

    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user

      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, currency')
        .eq('id', user.id)
        .maybeSingle()

      if (!canCreateWorkspace(companies.length, accountAccess)) {
        router.replace('/upgrade')
        return
      }

      const trimmedName = workspaceName.trim()
      if (workspaceType === 'business' && !trimmedName) {
        setMessage(t('workspaces.companyNameRequired'))
        setSubmitting(false)
        return
      }

      const name =
        trimmedName || (profile?.full_name?.trim() ? t('onboarding.namedWorkspace').replace('{name}', profile.full_name.trim()) : t('workspaces.personalWorkspace'))

      const { data, error } = await supabase
        .from('companies')
        .insert({
          owner_id: user.id,
          type: workspaceType,
          name,
          currency: normalizeCurrencyCode(workspaceCurrency || profile?.currency || 'USD'),
        })
        .select('id')
        .single()

      if (error) {
        throw error
      }

      await refreshCompanies(data.id)
      router.push('/app/dashboard')
    } catch (error) {
      console.error('Onboarding failed:', error)
      setMessage(error instanceof Error ? error.message : t('workspaces.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title={t('onboarding.title')} description={t('onboarding.loadingDescription')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('onboarding.title')} description={t('onboarding.description')} />
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{t('onboarding.workspaceSetup')}</CardTitle>
        </CardHeader>
        <CardContent>
          {companies.length > 0 && (
            <div className="mb-6 space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {t('onboarding.chooseWorkspace')}
              </div>
              <div className="space-y-2">
                {companies.map((company) => (
                  <div key={company.id} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{company.name}</p>
                      <p className="text-sm text-slate-500">
                        {company.type === 'business' ? t('workspaces.businessWorkspace') : t('workspaces.personalWorkspace')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {company.currency ?? 'USD'}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await refreshCompanies(company.id)
                          router.push('/app/dashboard')
                        }}
                      >
                        {t('onboarding.useThis')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!canCreateWorkspace(companies.length, accountAccess) ? (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {message || t('workspaces.limitReached')}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => router.push('/app/dashboard')}>{t('onboarding.goToDashboard')}</Button>
                <Button variant="outline" onClick={() => router.push('/app/workspaces')}>{t('onboarding.openWorkspaceSettings')}</Button>
                <Button variant="outline" onClick={() => router.push('/app/upgrade')}>{t('nav.switchToPro')}</Button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {message && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {message}
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-sm font-medium">{t('workspaces.type')}</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceType('personal')}
                  className={`rounded-lg border px-4 py-4 text-left ${workspaceType === 'personal' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                >
                  <p className="font-medium text-slate-900">{t('workspaces.personalWorkspace')}</p>
                  <p className="mt-1 text-sm text-slate-600">{t('onboarding.personalDescription')}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceType('business')}
                  className={`rounded-lg border px-4 py-4 text-left ${workspaceType === 'business' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}
                >
                  <p className="font-medium text-slate-900">{t('workspaces.businessWorkspace')}</p>
                  <p className="mt-1 text-sm text-slate-600">{t('onboarding.businessDescription')}</p>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">
                {workspaceType === 'business' ? t('workspaces.companyName') : t('workspaces.workspaceName')}
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-md border px-3 py-2"
                placeholder={workspaceType === 'business' ? t('onboarding.companyPlaceholder') : t('workspaces.personalWorkspace')}
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
              {submitting ? t('workspaces.creating') : t('onboarding.continueToDashboard')}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
