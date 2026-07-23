'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, ExternalLink, HelpCircle, Plug, Unplug } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

interface WooConnectionStatus {
  connected: boolean
  storeUrl: string
  consumerKeyPreview: string
  consumerSecretPreview: string
  inventorySyncEnabled: boolean
  updatedAt: string | null
}

interface WooPreviewProduct {
  id: number
  name: string
  sku: string
  price: string
  stock: number
  category: string
  image: string
}

const emptyStatus: WooConnectionStatus = {
  connected: false,
  storeUrl: '',
  consumerKeyPreview: '',
  consumerSecretPreview: '',
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
  const [importing, setImporting] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewProducts, setPreviewProducts] = useState<WooPreviewProduct[]>([])
  const [previewCategories, setPreviewCategories] = useState<string[]>([])
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConnection()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadConnection])

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

  const handleImportProducts = async (options?: { silent?: boolean }) => {
    if (!currentCompany) return

    setImporting(true)
    if (!options?.silent) setMessage('')
    setError('')

    const response = await fetch('/api/woocommerce/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.importFailed'))
    } else {
      setMessage(t('woocommerce.importSuccess').replace('{count}', String(payload.imported ?? 0)))
    }

    setImporting(false)
  }

  const handlePreviewCatalog = async () => {
    if (!currentCompany) return

    setPreviewLoading(true)
    setError('')
    setMessage('')

    const response = await fetch(`/api/woocommerce/products/preview?companyId=${encodeURIComponent(currentCompany.id)}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(payload.error ?? t('woocommerce.previewFailed'))
      setPreviewProducts([])
      setPreviewCategories([])
    } else {
      setPreviewProducts(payload.products ?? [])
      setPreviewCategories(payload.categories ?? [])
      setMessage(t('woocommerce.previewLoaded').replace('{count}', String((payload.products ?? []).length)))
    }

    setPreviewLoading(false)
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

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>{t('integrations.storeIntegrations')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            { name: 'WooCommerce', status: status.connected ? t('woocommerce.connected') : t('woocommerce.notConnected') },
            { name: 'Shopify', status: t('integrations.comingSoon') },
            { name: 'OpenCart', status: t('integrations.comingSoon') },
          ].map((integration) => (
            <div key={integration.name} className="rounded-lg border border-slate-200 p-4">
              <p className="font-semibold text-slate-950">{integration.name}</p>
              <p className="mt-1 text-sm text-slate-500">{integration.status}</p>
            </div>
          ))}
        </CardContent>
      </Card>

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
            <details className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
              <summary className="flex cursor-pointer items-center gap-2 font-medium">
                <HelpCircle className="h-4 w-4" />
                {t('woocommerce.keysHelpTitle')}
              </summary>
              <ol className="mt-3 list-decimal space-y-1 pl-5">
                {Array.from({ length: 11 }, (_, index) => (
                  <li key={index}>{t(`woocommerce.keysHelp.step${index + 1}`)}</li>
                ))}
              </ol>
              <p className="mt-3 font-medium text-blue-900">{t('woocommerce.secretWarning')}</p>
              <a
                href="https://woocommerce.com/document/woocommerce-rest-api/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
              >
                {t('woocommerce.officialDocs')}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </details>

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

            {status.connected && (
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">{t('woocommerce.savedStore')}</p>
                  <p className="break-all">{status.storeUrl}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">{t('woocommerce.savedConsumerKey')}</p>
                  <p>{status.consumerKeyPreview}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-slate-500">{t('woocommerce.savedConsumerSecret')}</p>
                  <p>{status.consumerSecretPreview}</p>
                </div>
              </div>
            )}

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
              {status.connected && (
                <Button type="button" variant="outline" onClick={() => void handleImportProducts()} disabled={importing || saving}>
                  {importing ? t('common.loading') : t('woocommerce.importProducts')}
                </Button>
              )}
              {status.connected && (
                <Button type="button" variant="outline" onClick={handlePreviewCatalog} disabled={previewLoading || saving}>
                  {previewLoading ? t('common.loading') : t('woocommerce.previewCatalog')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {(previewProducts.length > 0 || previewCategories.length > 0) && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>{t('woocommerce.storeCatalog')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewCategories.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">{t('products.category')}</p>
                <div className="flex flex-wrap gap-2">
                  {previewCategories.map((category) => (
                    <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{category}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {previewProducts.map((product) => (
                <div key={product.id} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                  {product.image ? <img src={product.image} alt="" className="h-14 w-14 rounded-md object-cover" /> : <div className="h-14 w-14 rounded-md bg-slate-100" />}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{product.name}</p>
                    <p className="text-xs text-slate-500">{[product.sku, product.category].filter(Boolean).join(' · ') || '-'}</p>
                    <p className="text-xs text-slate-500">{product.price} · {t('products.currentStock')}: {product.stock}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  )
}
