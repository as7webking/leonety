'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Plug, Unplug } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

interface WooConnectionStatus {
  connected: boolean
  storeUrl: string
  inventorySyncEnabled: boolean
  updatedAt: string | null
}

const emptyStatus: WooConnectionStatus = {
  connected: false,
  storeUrl: '',
  inventorySyncEnabled: false,
  updatedAt: null,
}

export default function WooCommerceSettingsPage() {
  const router = useRouter()
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [status, setStatus] = useState<WooConnectionStatus>(emptyStatus)
  const [storeUrl, setStoreUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [inventorySyncEnabled, setInventorySyncEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadConnection = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const response = await fetch(`/api/woocommerce/connection?companyId=${encodeURIComponent(currentCompany.id)}`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setStatus(emptyStatus)
      setError(payload.error ?? t('woocommerce.databaseRequired'))
    } else {
      const nextStatus = payload as WooConnectionStatus
      setStatus(nextStatus)
      setStoreUrl(nextStatus.storeUrl)
      setInventorySyncEnabled(nextStatus.inventorySyncEnabled)
    }

    setLoading(false)
  }, [currentCompany, t])

  useEffect(() => { void loadConnection() }, [loadConnection])

  const handleTest = async () => {
    if (!currentCompany) return

    setTesting(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/woocommerce/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: currentCompany.id,
        storeUrl,
        consumerKey,
        consumerSecret,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.connectionFailed'))
    } else {
      setMessage(t('woocommerce.connectionTested'))
    }

    setTesting(false)
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return

    setSaving(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/woocommerce/connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: currentCompany.id,
        storeUrl,
        consumerKey,
        consumerSecret,
        inventorySyncEnabled,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.connectionFailed'))
    } else {
      const nextStatus = payload as WooConnectionStatus
      setStatus(nextStatus)
      setStoreUrl(nextStatus.storeUrl)
      setInventorySyncEnabled(nextStatus.inventorySyncEnabled)
      setConsumerKey('')
      setConsumerSecret('')
      setMessage(t('woocommerce.connectionSaved'))
    }

    setSaving(false)
  }

  const handleDisconnect = async () => {
    if (!currentCompany) return

    setSaving(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/woocommerce/connection', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.connectionFailed'))
    } else {
      setStatus(emptyStatus)
      setStoreUrl('')
      setConsumerKey('')
      setConsumerSecret('')
      setInventorySyncEnabled(false)
      setMessage(t('woocommerce.disconnected'))
    }

    setSaving(false)
  }

  if (companyLoading || loading) {
    return <PageContainer><PageHeader title={t('woocommerce.title')} /><LoadingSkeleton /></PageContainer>
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <EmptyState
          icon={Building2}
          title={t('common.noWorkspaceSelected')}
          action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={t('woocommerce.title')} />
        <EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('woocommerce.title')} description={`${t('woocommerce.description')} · ${currentCompany.name}`}>
        <Link href="/app/products"><Button variant="outline">{t('products.title')}</Button></Link>
      </PageHeader>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('woocommerce.integrationSettings')}</CardTitle>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm ${status.connected ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
              {status.connected ? <Plug className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
              {status.connected ? t('woocommerce.connected') : t('woocommerce.notConnected')}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-5">
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('woocommerce.storeUrl')}</span>
              <input
                value={storeUrl}
                onChange={(event) => setStoreUrl(event.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-md border px-3 py-2"
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('woocommerce.consumerKey')}</span>
                <input
                  value={consumerKey}
                  onChange={(event) => setConsumerKey(event.target.value)}
                  placeholder={status.connected ? t('woocommerce.keepSecretHint') : 'ck_...'}
                  className="w-full rounded-md border px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t('woocommerce.consumerSecret')}</span>
                <input
                  type="password"
                  value={consumerSecret}
                  onChange={(event) => setConsumerSecret(event.target.value)}
                  placeholder={status.connected ? t('woocommerce.keepSecretHint') : 'cs_...'}
                  className="w-full rounded-md border px-3 py-2"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-md border bg-slate-50 p-3">
              <input
                type="checkbox"
                checked={inventorySyncEnabled}
                onChange={(event) => setInventorySyncEnabled(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium">{t('woocommerce.inventorySync')}</span>
                <span className="block text-sm text-slate-500">{t('woocommerce.inventorySyncDescription')}</span>
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handleTest} disabled={testing || saving}>
                {testing ? t('common.loading') : t('woocommerce.testConnection')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('common.loading') : t('woocommerce.saveConnection')}
              </Button>
              {status.connected && (
                <Button type="button" variant="outline" onClick={handleDisconnect} disabled={saving}>
                  {t('woocommerce.disconnect')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
