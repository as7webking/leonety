'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Send, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import {
  createCurrentPushSubscription,
  detectDevicePlatform,
  getCurrentPushSubscription,
  getPushInstallationId,
  getWebPushCapability,
  resolveWebPushViewStatus,
  type WebPushCapability,
} from '@/lib/web-push-client'

interface CurrentDevice {
  id: string
  label: string
  platform: string
  status: 'enabled' | 'invalid' | 'disabled'
  lastSeenAt: string
}

interface NotificationSettingsResponse {
  configured: boolean
  vapidPublicKey: string
  device: CurrentDevice | null
}

export default function NotificationSettingsPage() {
  const { currentCompany } = useCompany()
  const { locale, t } = useI18n()
  const [capability, setCapability] = useState<WebPushCapability | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [platform, setPlatform] = useState('')
  const [installationId, setInstallationId] = useState('')
  const [settings, setSettings] = useState<NotificationSettingsResponse | null>(null)
  const [browserSubscribed, setBrowserSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const companyId = currentCompany?.id ?? ''

  const load = useCallback(async (id: string) => {
    if (!companyId) return
    setError('')

    const [response, subscription] = await Promise.all([
      fetch(`/api/notifications?companyId=${encodeURIComponent(companyId)}&installationId=${encodeURIComponent(id)}`, { cache: 'no-store' }),
      getCurrentPushSubscription().catch(() => null),
    ])
    const payload = await response.json().catch(() => ({})) as NotificationSettingsResponse & { error?: string }

    if (!response.ok) {
      setError(payload.error === 'migration_required'
        ? t('systemNotifications.migrationRequired')
        : t('systemNotifications.enableFailed'))
      return
    }

    setSettings(payload)
    setBrowserSubscribed(Boolean(subscription))
  }, [companyId, t])

  useEffect(() => {
    const nextCapability = getWebPushCapability()
    const id = getPushInstallationId()
    setSettings(null)
    setCapability(nextCapability)
    setPlatform(detectDevicePlatform())
    setInstallationId(id)
    setPermission('Notification' in window ? Notification.permission : 'default')
  }, [load])

  useEffect(() => {
    if (!installationId) return
    const refreshState = () => {
      if (document.visibilityState === 'hidden') return
      setPermission('Notification' in window ? Notification.permission : 'default')
      void load(installationId)
    }

    refreshState()
    window.addEventListener('focus', refreshState)
    document.addEventListener('visibilitychange', refreshState)
    return () => {
      window.removeEventListener('focus', refreshState)
      document.removeEventListener('visibilitychange', refreshState)
    }
  }, [installationId, load])

  const viewStatus = resolveWebPushViewStatus({
    capability,
    permission,
    browserSubscribed,
    serverStatus: settings?.device?.status,
  })
  const enabled = viewStatus === 'enabled'

  const enableNotifications = async () => {
    if (!companyId || !installationId || !capability?.supported || capability.iosInstallRequired || !settings?.vapidPublicKey) return
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        setError(t('systemNotifications.blocked'))
        return
      }

      const subscription = await createCurrentPushSubscription(settings.vapidPublicKey)
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          installationId,
          deviceLabel: `${currentCompany?.name ?? 'Leonety'} · ${platform || 'Web browser'}`.slice(0, 80),
          platform: platform || 'Web browser',
          locale,
          subscription: subscription.toJSON(),
        }),
      })
      if (!response.ok) throw new Error('registration_failed')

      setMessage(t('systemNotifications.enabledSuccess'))
      await load(installationId)
    } catch {
      setError(t('systemNotifications.enableFailed'))
    } finally {
      setBusy(false)
    }
  }

  const disableNotifications = async () => {
    if (!companyId || !installationId) return
    setBusy(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, installationId }),
      })
      if (!response.ok) throw new Error('disable_failed')

      const subscription = await getCurrentPushSubscription()
      if (subscription) await subscription.unsubscribe()
      setMessage(t('systemNotifications.disabledSuccess'))
      await load(installationId)
    } catch {
      setError(t('systemNotifications.disableFailed'))
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    if (!companyId || !installationId) return
    setBusy(true)
    setError('')
    setMessage('')

    const response = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, installationId }),
    })

    if (response.ok) setMessage(t('systemNotifications.testSent'))
    else {
      setError(t('systemNotifications.testFailed'))
      await load(installationId)
    }
    setBusy(false)
  }

  if (!currentCompany) return null

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-950">{t('systemNotifications.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('systemNotifications.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            {t('systemNotifications.currentDevice')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{t('systemNotifications.status')}</p>
              <p className="mt-1 font-medium text-slate-950">{t(`systemNotifications.${viewStatus}`)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{t('systemNotifications.currentDevice')}</p>
              <p className="mt-1 font-medium text-slate-950">{settings?.device?.label ?? (platform || '-')}</p>
            </div>
          </div>

          {message && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {capability?.iosInstallRequired && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('systemNotifications.iosInstall')}</p>}
          {capability && !capability.supported && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('systemNotifications.unsupported')}</p>}
          {settings && !settings.configured && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('systemNotifications.configurationRequired')}</p>}

          <div className="rounded-md bg-slate-50 p-4">
            <p className="font-medium text-slate-900">{t('systemNotifications.systemSound')}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('systemNotifications.systemSoundHint')}</p>
          </div>

          {!enabled && <p className="text-sm leading-6 text-slate-600">{t('systemNotifications.consent')}</p>}

          <div className="flex flex-wrap gap-2">
            {!enabled ? (
              <Button
                type="button"
                onClick={() => void enableNotifications()}
                disabled={busy || !capability?.supported || capability.iosInstallRequired || !settings?.configured}
              >
                <Smartphone className="h-4 w-4" />
                {t('systemNotifications.enable')}
              </Button>
            ) : (
              <>
                <Button type="button" onClick={() => void sendTest()} disabled={busy}>
                  <Send className="h-4 w-4" />
                  {t('systemNotifications.test')}
                </Button>
                <Button type="button" variant="outline" onClick={() => void disableNotifications()} disabled={busy}>
                  <BellOff className="h-4 w-4" />
                  {t('systemNotifications.disable')}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
