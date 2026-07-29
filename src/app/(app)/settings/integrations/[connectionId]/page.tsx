'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clock3, Plug, Store, Unplug } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import type { Locale } from '@/lib/i18n'

type Provider = 'woocommerce' | 'shopify' | 'opencart' | 'google_merchant' | 'iss_pos'
type IntegrationStatus = 'not_connected' | 'connected' | 'error' | 'disabled'

interface StoreIntegration {
  id: string
  provider: Provider
  storeName: string
  storeUrl: string
  externalAccountId: string
  apiKeyPreview: string
  apiSecretPreview: string
  merchantId: string
  accessTokenPreview: string
  refreshTokenPreview: string
  status: IntegrationStatus
  lastSyncAt: string | null
  errorMessage: string
  updatedAt: string | null
}

const providerLabels: Record<Provider, string> = {
  woocommerce: 'WooCommerce',
  shopify: 'Shopify',
  opencart: 'OpenCart',
  google_merchant: 'Google Merchant',
  iss_pos: 'ISS POS',
}

const copy: Record<Locale, Record<string, string>> = {
  en: {
    back: 'Back to integrations',
    title: 'Store connection',
    description: 'Manage this connected store for the current workspace.',
    status: 'Status',
    connected: 'Connected',
    notConnected: 'Not connected',
    error: 'Error',
    provider: 'Provider',
    storeName: 'Store name',
    storeUrl: 'Store URL',
    lastSync: 'Last sync',
    neverSynced: 'Never synced',
    savedCredentials: 'Saved credentials',
    apiKey: 'API key',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Test connection',
    importProducts: 'Import products',
    exportProducts: 'Export products CSV',
    syncProducts: 'Synchronize products',
    disconnect: 'Disconnect',
    openLegacyWoo: 'Open WooCommerce tools',
    notFound: 'Connection not found for this workspace.',
    imported: 'Imported products: {count}.',
    synced: 'Synced: {synced}. Failed: {failed}.',
    tested: 'Connection test completed.',
    disconnected: 'Connection disconnected.',
    unsupported: 'This action is not available for this connector yet.',
    schemaUnavailable: 'Store integrations are temporarily unavailable. Run the Supabase migration and try again.',
    issSetup: 'ISS POS API configuration is required before testing or synchronization.',
  },
  de: {
    back: 'Zurück zu Integrationen',
    title: 'Shop-Verbindung',
    description: 'Verwalte diesen verbundenen Shop für den aktuellen Arbeitsbereich.',
    status: 'Status',
    connected: 'Verbunden',
    notConnected: 'Nicht verbunden',
    error: 'Fehler',
    provider: 'Anbieter',
    storeName: 'Shop-Name',
    storeUrl: 'Shop-URL',
    lastSync: 'Letzte Synchronisierung',
    neverSynced: 'Noch nie synchronisiert',
    savedCredentials: 'Gespeicherte Zugangsdaten',
    apiKey: 'API-Key',
    apiSecret: 'API-Secret',
    accessToken: 'Access Token',
    refreshToken: 'Refresh Token',
    merchantId: 'Merchant-ID',
    test: 'Verbindung testen',
    importProducts: 'Produkte importieren',
    exportProducts: 'Produkte als CSV exportieren',
    syncProducts: 'Produkte synchronisieren',
    disconnect: 'Trennen',
    openLegacyWoo: 'WooCommerce-Werkzeuge öffnen',
    notFound: 'Verbindung für diesen Arbeitsbereich nicht gefunden.',
    imported: 'Importierte Produkte: {count}.',
    synced: 'Synchronisiert: {synced}. Fehlgeschlagen: {failed}.',
    tested: 'Verbindungstest abgeschlossen.',
    disconnected: 'Verbindung getrennt.',
    unsupported: 'Diese Aktion ist für diesen Connector noch nicht verfügbar.',
    schemaUnavailable: 'Shop-Integrationen sind vorübergehend nicht verfügbar. Führe die Supabase-Migration aus und versuche es erneut.',
    issSetup: 'ISS POS benötigt eine API-Konfiguration, bevor Tests oder Synchronisierung möglich sind.',
  },
  ru: {
    back: 'Назад к интеграциям',
    title: 'Подключение магазина',
    description: 'Управление этим подключенным магазином для текущего workspace.',
    status: 'Статус',
    connected: 'Подключено',
    notConnected: 'Не подключено',
    error: 'Ошибка',
    provider: 'Провайдер',
    storeName: 'Название магазина',
    storeUrl: 'URL магазина',
    lastSync: 'Последняя синхронизация',
    neverSynced: 'Еще не синхронизировалось',
    savedCredentials: 'Сохраненные данные',
    apiKey: 'API key',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Проверить подключение',
    importProducts: 'Импорт товаров',
    exportProducts: 'Экспорт товаров CSV',
    syncProducts: 'Синхронизировать товары',
    disconnect: 'Отключить',
    openLegacyWoo: 'Открыть инструменты WooCommerce',
    notFound: 'Подключение для этого workspace не найдено.',
    imported: 'Импортировано товаров: {count}.',
    synced: 'Синхронизировано: {synced}. Ошибок: {failed}.',
    tested: 'Проверка подключения завершена.',
    disconnected: 'Подключение отключено.',
    unsupported: 'Это действие для данного connector пока недоступно.',
    schemaUnavailable: 'Интеграции магазинов временно недоступны. Выполните Supabase migration и попробуйте снова.',
    issSetup: 'Для ISS POS нужна API-конфигурация перед тестом или синхронизацией.',
  },
  tr: {
    back: 'Entegrasyonlara dön',
    title: 'Mağaza bağlantısı',
    description: 'Geçerli çalışma alanı için bu mağaza bağlantısını yönetin.',
    status: 'Durum',
    connected: 'Bağlı',
    notConnected: 'Bağlı değil',
    error: 'Hata',
    provider: 'Sağlayıcı',
    storeName: 'Mağaza adı',
    storeUrl: 'Mağaza URL',
    lastSync: 'Son senkronizasyon',
    neverSynced: 'Henüz senkronize edilmedi',
    savedCredentials: 'Kayıtlı bilgiler',
    apiKey: 'API anahtarı',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Bağlantıyı test et',
    importProducts: 'Ürünleri içe aktar',
    exportProducts: 'Ürünleri CSV dışa aktar',
    syncProducts: 'Ürünleri senkronize et',
    disconnect: 'Bağlantıyı kes',
    openLegacyWoo: 'WooCommerce araçlarını aç',
    notFound: 'Bu çalışma alanı için bağlantı bulunamadı.',
    imported: 'İçe aktarılan ürünler: {count}.',
    synced: 'Senkronize: {synced}. Hatalı: {failed}.',
    tested: 'Bağlantı testi tamamlandı.',
    disconnected: 'Bağlantı kesildi.',
    unsupported: 'Bu işlem bu connector için henüz kullanılamıyor.',
    schemaUnavailable: 'Mağaza entegrasyonları geçici olarak kullanılamıyor. Supabase migration çalıştırıp tekrar deneyin.',
    issSetup: 'ISS POS için test veya senkronizasyon öncesinde API yapılandırması gerekir.',
  },
  uk: {
    back: 'Назад до інтеграцій',
    title: 'Підключення магазину',
    description: 'Керуйте цим підключеним магазином для поточного workspace.',
    status: 'Статус',
    connected: 'Підключено',
    notConnected: 'Не підключено',
    error: 'Помилка',
    provider: 'Провайдер',
    storeName: 'Назва магазину',
    storeUrl: 'URL магазину',
    lastSync: 'Остання синхронізація',
    neverSynced: 'Ще не синхронізовано',
    savedCredentials: 'Збережені дані',
    apiKey: 'API key',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Перевірити підключення',
    importProducts: 'Імпорт товарів',
    exportProducts: 'Експорт товарів CSV',
    syncProducts: 'Синхронізувати товари',
    disconnect: 'Відключити',
    openLegacyWoo: 'Відкрити інструменти WooCommerce',
    notFound: 'Підключення для цього workspace не знайдено.',
    imported: 'Імпортовано товарів: {count}.',
    synced: 'Синхронізовано: {synced}. Помилок: {failed}.',
    tested: 'Перевірку підключення завершено.',
    disconnected: 'Підключення відключено.',
    unsupported: 'Ця дія для цього connector поки недоступна.',
    schemaUnavailable: 'Інтеграції магазинів тимчасово недоступні. Виконайте Supabase migration і спробуйте ще раз.',
    issSetup: 'Для ISS POS потрібна API-конфігурація перед тестом або синхронізацією.',
  },
  pl: {
    back: 'Wróć do integracji',
    title: 'Połączenie sklepu',
    description: 'Zarządzaj tym połączonym sklepem dla bieżącego workspace.',
    status: 'Status',
    connected: 'Połączono',
    notConnected: 'Nie połączono',
    error: 'Błąd',
    provider: 'Dostawca',
    storeName: 'Nazwa sklepu',
    storeUrl: 'URL sklepu',
    lastSync: 'Ostatnia synchronizacja',
    neverSynced: 'Jeszcze nie synchronizowano',
    savedCredentials: 'Zapisane dane',
    apiKey: 'API key',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Testuj połączenie',
    importProducts: 'Importuj produkty',
    exportProducts: 'Eksport produktów CSV',
    syncProducts: 'Synchronizuj produkty',
    disconnect: 'Odłącz',
    openLegacyWoo: 'Otwórz narzędzia WooCommerce',
    notFound: 'Nie znaleziono połączenia dla tego workspace.',
    imported: 'Zaimportowano produkty: {count}.',
    synced: 'Zsynchronizowano: {synced}. Błędy: {failed}.',
    tested: 'Test połączenia zakończony.',
    disconnected: 'Połączenie odłączone.',
    unsupported: 'Ta akcja nie jest jeszcze dostępna dla tego connectora.',
    schemaUnavailable: 'Integracje sklepów są tymczasowo niedostępne. Uruchom migrację Supabase i spróbuj ponownie.',
    issSetup: 'ISS POS wymaga konfiguracji API przed testem lub synchronizacją.',
  },
  fr: {
    back: 'Retour aux intégrations',
    title: 'Connexion de boutique',
    description: 'Gérez cette boutique connectée pour l’espace de travail actuel.',
    status: 'Statut',
    connected: 'Connecté',
    notConnected: 'Non connecté',
    error: 'Erreur',
    provider: 'Fournisseur',
    storeName: 'Nom de la boutique',
    storeUrl: 'URL de la boutique',
    lastSync: 'Dernière synchronisation',
    neverSynced: 'Jamais synchronisé',
    savedCredentials: 'Données enregistrées',
    apiKey: 'API key',
    apiSecret: 'API secret',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    merchantId: 'Merchant ID',
    test: 'Tester la connexion',
    importProducts: 'Importer les produits',
    exportProducts: 'Exporter les produits CSV',
    syncProducts: 'Synchroniser les produits',
    disconnect: 'Déconnecter',
    openLegacyWoo: 'Ouvrir les outils WooCommerce',
    notFound: 'Connexion introuvable pour cet espace de travail.',
    imported: 'Produits importés : {count}.',
    synced: 'Synchronisés : {synced}. Échecs : {failed}.',
    tested: 'Test de connexion terminé.',
    disconnected: 'Connexion déconnectée.',
    unsupported: 'Cette action n’est pas encore disponible pour ce connecteur.',
    schemaUnavailable: 'Les intégrations de boutiques sont temporairement indisponibles. Exécutez la migration Supabase puis réessayez.',
    issSetup: 'ISS POS nécessite une configuration API avant le test ou la synchronisation.',
  },
}

function statusLabel(status: IntegrationStatus, labels: Record<string, string>) {
  if (status === 'connected') return labels.connected
  if (status === 'error') return labels.error
  if (status === 'disabled') return labels.notConnected
  return labels.notConnected
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function localizedApiError(payload: { code?: string; error?: string }, labels: Record<string, string>) {
  if (payload.code === 'STORE_INTEGRATIONS_SCHEMA_REQUIRED') return labels.schemaUnavailable
  if (payload.error?.includes('external_account_id') || payload.error?.includes('42703')) return labels.schemaUnavailable
  return payload.error ?? labels.error
}

export default function StoreIntegrationDetailPage() {
  const router = useRouter()
  const params = useParams<{ connectionId: string }>()
  const { currentCompany, loading } = useCompany()
  const { locale, t } = useI18n()
  const labels = copy[locale] ?? copy.en
  const connectionId = decodeURIComponent(params.connectionId ?? '')
  const [integrations, setIntegrations] = useState<StoreIntegration[]>([])
  const [loadingConnection, setLoadingConnection] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const connectionRequestRef = useRef<AbortController | null>(null)

  const connection = useMemo(
    () => integrations.find((item) => item.id === connectionId),
    [connectionId, integrations]
  )

  const loadConnection = useCallback(async () => {
    if (!currentCompany) {
      setLoadingConnection(false)
      return
    }

    connectionRequestRef.current?.abort()
    const controller = new AbortController()
    connectionRequestRef.current = controller

    setLoadingConnection(true)
    setError('')

    try {
      const response = await fetch(`/api/store-integrations?companyId=${encodeURIComponent(currentCompany.id)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setIntegrations([])
        setError(localizedApiError(payload, copy.en))
      } else {
        setIntegrations((payload.integrations ?? []) as StoreIntegration[])
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setIntegrations([])
      setError(loadError instanceof Error ? loadError.message : copy.en.schemaUnavailable)
    } finally {
      if (connectionRequestRef.current === controller) {
        connectionRequestRef.current = null
        setLoadingConnection(false)
      }
    }
  }, [currentCompany])

  useEffect(() => {
    void loadConnection()

    return () => {
      connectionRequestRef.current?.abort()
    }
  }, [loadConnection])

  const runAction = async (action: string, task: () => Promise<string>) => {
    setBusyAction(action)
    setMessage('')
    setError('')

    try {
      const nextMessage = await task()
      setMessage(nextMessage)
      await loadConnection()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : labels.error)
    } finally {
      setBusyAction('')
    }
  }

  const readJson = async (response: Response) => {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(localizedApiError(payload, labels))
    }

    return payload
  }

  const testConnection = () => {
    if (!currentCompany || !connection) return

    void runAction('test', async () => {
      if (connection.provider !== 'woocommerce') {
        if (connection.provider === 'iss_pos') return labels.issSetup
        return labels.unsupported
      }

      const response = await fetch('/api/woocommerce/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id }),
      })
      await readJson(response)
      return labels.tested
    })
  }

  const importProducts = () => {
    if (!currentCompany || !connection) return

    void runAction('import', async () => {
      const endpoint = connection.provider === 'woocommerce'
        ? '/api/woocommerce/products/import'
        : '/api/store-integrations/products/import'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, provider: connection.provider }),
      })
      const payload = await readJson(response)
      return labels.imported.replace('{count}', String(payload.imported ?? payload.created ?? 0))
    })
  }

  const exportProducts = () => {
    if (!currentCompany || !connection) return

    void runAction('export', async () => {
      const response = await fetch('/api/store-integrations/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, provider: connection.provider }),
      })

      if (!response.ok) {
        await readJson(response)
      }

      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = `leonety-${connection.provider}-products.csv`
      link.click()
      URL.revokeObjectURL(href)
      return labels.exportProducts
    })
  }

  const syncProducts = () => {
    if (!currentCompany || !connection) return

    void runAction('sync', async () => {
      if (connection.provider === 'woocommerce' || connection.provider === 'opencart') {
        return labels.unsupported
      }
      if (connection.provider === 'iss_pos') return labels.issSetup

      const response = await fetch('/api/store-integrations/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, provider: connection.provider }),
      })
      const payload = await readJson(response)
      return labels.synced
        .replace('{synced}', String(payload.synced ?? 0))
        .replace('{failed}', String(payload.failed ?? 0))
    })
  }

  const disconnect = () => {
    if (!currentCompany || !connection) return

    void runAction('disconnect', async () => {
      const endpoint = connection.id === 'woocommerce-legacy'
        ? '/api/woocommerce/connection'
        : '/api/store-integrations'
      const body = connection.id === 'woocommerce-legacy'
        ? { companyId: currentCompany.id }
        : { companyId: currentCompany.id, provider: connection.provider }

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await readJson(response)
      router.push('/app/settings/integrations')
      return labels.disconnected
    })
  }

  if (loading || loadingConnection) {
    return (
      <PageContainer>
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany || !connection) {
    return (
      <PageContainer>
        <Link href="/app/settings/integrations" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          {labels.back}
        </Link>
        <EmptyState icon={Store} title={labels.notFound} />
      </PageContainer>
    )
  }

  const previews = [
    [labels.apiKey, connection.apiKeyPreview],
    [labels.apiSecret, connection.apiSecretPreview],
    [labels.accessToken, connection.accessTokenPreview],
    [labels.refreshToken, connection.refreshTokenPreview],
    [labels.merchantId, connection.merchantId],
  ].filter(([, value]) => Boolean(value))

  return (
    <PageContainer>
      <Link href="/app/settings/integrations" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        {labels.back}
      </Link>

      <PageHeader title={labels.title} description={`${labels.description} · ${currentCompany.name}`} />

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {connection.storeName || providerLabels[connection.provider]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label={labels.provider} value={providerLabels[connection.provider]} />
              <Info label={labels.status} value={statusLabel(connection.status, labels)} />
              <Info label={labels.storeName} value={connection.storeName || '-'} />
              <Info label={labels.storeUrl} value={connection.storeUrl || connection.externalAccountId || '-'} />
              <Info label={labels.lastSync} value={formatDate(connection.lastSyncAt, locale) || labels.neverSynced} />
            </div>

            {connection.errorMessage && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {connection.errorMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={testConnection}>
                {busyAction === 'test' ? t('common.loading') : labels.test}
              </Button>
              <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={importProducts}>
                {busyAction === 'import' ? t('common.loading') : labels.importProducts}
              </Button>
              <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={exportProducts}>
                {busyAction === 'export' ? t('common.loading') : labels.exportProducts}
              </Button>
              <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={syncProducts}>
                {busyAction === 'sync' ? t('common.loading') : labels.syncProducts}
              </Button>
              {connection.provider === 'woocommerce' && (
                <Link href="/app/settings/integrations/woocommerce">
                  <Button type="button" variant="outline">{labels.openLegacyWoo}</Button>
                </Link>
              )}
              <Button type="button" variant="outline" disabled={Boolean(busyAction)} onClick={disconnect}>
                {busyAction === 'disconnect' ? t('common.loading') : labels.disconnect}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{labels.savedCredentials}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
              connection.status === 'connected'
                ? 'bg-green-100 text-green-700'
                : connection.status === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-600'
            }`}>
              {connection.status === 'connected' ? <Plug className="h-3.5 w-3.5" /> : <Unplug className="h-3.5 w-3.5" />}
              {statusLabel(connection.status, labels)}
            </p>
            <p className="flex items-center gap-1 text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              {formatDate(connection.updatedAt, locale) || labels.neverSynced}
            </p>
            {previews.length > 0 ? previews.map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-1 break-all font-mono text-sm text-slate-900">{value}</p>
              </div>
            )) : (
              <p className="text-slate-500">{labels.notConnected}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
