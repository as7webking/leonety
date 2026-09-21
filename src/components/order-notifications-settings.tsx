'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BellRing, Clipboard, Play, RotateCw, Smartphone, Square, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'

const INSTALLATION_KEY = 'leonety-order-alert-installation-id'

interface DeviceView { id:string; label:string; platform:string; status:'enabled'|'invalid'|'disabled'; lastSeenAt:string; isCurrent:boolean }
interface SettingsView {
  enabled:boolean; activeDeviceId:string|null; devices:DeviceView[]; vapidPublicKey:string
  sound:{enabled:boolean;hasCustom:boolean;name:string;mime:string}
  wooCommerce:{connected:boolean;webhookConfigured:boolean;webhookUrl:string;configuredAt:string|null}
}

function getInstallationId() {
  const saved = window.localStorage.getItem(INSTALLATION_KEY)
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved
  const next = crypto.randomUUID()
  window.localStorage.setItem(INSTALLATION_KEY, next)
  return next
}

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'iOS/iPadOS'
  if (/android/.test(ua)) return 'Android'
  if (/mac/.test(ua)) return 'macOS'
  if (/windows/.test(ua)) return 'Windows'
  return 'Web browser'
}

function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) }
function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone)
}
function base64ToBytes(value:string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function OrderNotificationsSettings({ companyId, companyName, wooConnected }: { companyId:string; companyName:string; wooConnected:boolean }) {
  const { locale, t } = useI18n()
  const [settings, setSettings] = useState<SettingsView|null>(null)
  const [installationId, setInstallationId] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [consenting, setConsenting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [soundFile, setSoundFile] = useState<File|null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const audioRef = useRef<HTMLAudioElement|null>(null)

  const capability = useMemo(() => {
    if (typeof window === 'undefined') return { supported:false, iosInstallRequired:false }
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    return { supported, iosInstallRequired:isIos() && !isStandalone() }
  }, [])

  const load = useCallback(async () => {
    const id = installationId || getInstallationId()
    if (!installationId) setInstallationId(id)
    const response = await fetch(`/api/order-notifications?companyId=${encodeURIComponent(companyId)}&installationId=${encodeURIComponent(id)}`, { cache:'no-store' })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(payload.error === 'migration_required' ? t('orderNotifications.migrationRequired') : t('orderNotifications.loadFailed'))
      return
    }
    setSettings(payload as SettingsView)
    const current = (payload.devices as DeviceView[]).find((device) => device.isCurrent)
    setDeviceLabel(current?.label || `${companyName} · ${detectPlatform()}`.slice(0,80))
  }, [companyId, companyName, installationId, t])

  useEffect(() => {
    setPermission('Notification' in window ? Notification.permission : 'default')
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => () => {
    audioRef.current?.pause()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const registerDevice = async () => {
    if (!capability.supported || capability.iosInstallRequired || !settings?.vapidPublicKey || !installationId) return
    setBusy(true); setError(''); setMessage('')
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') throw new Error('permission_denied')
      const registration = await navigator.serviceWorker.ready
      const existingSubscription = await registration.pushManager.getSubscription()
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:base64ToBytes(settings.vapidPublicKey) })
      const response = await fetch('/api/order-notifications', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId, installationId, deviceLabel:deviceLabel.trim(), platform:detectPlatform(), locale, subscription:subscription.toJSON() }) })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'save_failed')
      setConsenting(false); setMessage(t('orderNotifications.enabledSuccess')); await load()
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'permission_denied' ? t('orderNotifications.permissionDenied') : t('orderNotifications.saveFailed'))
    } finally { setBusy(false) }
  }

  const update = async (body:Record<string,unknown>, success:string) => {
    setBusy(true); setError(''); setMessage('')
    const response = await fetch('/api/order-notifications', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId, ...body }) })
    if (!response.ok) setError(t('orderNotifications.saveFailed'))
    else { setMessage(success); await load() }
    setBusy(false)
  }

  const sendTest = async () => {
    setBusy(true); setError(''); setMessage('')
    const response = await fetch('/api/order-notifications/test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({companyId}) })
    if (!response.ok) { setError(t('orderNotifications.saveFailed')); await load() }
    else setMessage(t('orderNotifications.testSent'))
    setBusy(false)
  }

  const generateWebhook = async () => {
    setBusy(true); setError(''); setWebhookSecret('')
    const response = await fetch('/api/order-notifications/webhook', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({companyId}) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) setError(payload.error === 'migration_required' ? t('orderNotifications.migrationRequired') : t('orderNotifications.saveFailed'))
    else { setWebhookSecret(payload.secret); await load() }
    setBusy(false)
  }

  const chooseSound = (file:File|null) => {
    audioRef.current?.pause()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSoundFile(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : '')
  }
  const playSound = async () => {
    let url = previewUrl
    if (!url && settings?.sound.hasCustom) {
      const response = await fetch(`/api/order-notifications/sound?companyId=${encodeURIComponent(companyId)}`, {cache:'no-store'})
      const payload = await response.json().catch(() => ({})); url = payload.url || ''
    }
    if (!url) return
    audioRef.current?.pause(); const audio = new Audio(url); audioRef.current = audio; await audio.play().catch(() => undefined)
  }
  const uploadSound = async () => {
    if (!soundFile || soundFile.size > 2*1024*1024 || !['audio/mpeg','audio/wav','audio/x-wav'].includes(soundFile.type)) { setError(t('orderNotifications.invalidSound')); return }
    setBusy(true); setError(''); const form = new FormData(); form.set('companyId',companyId); form.set('file',soundFile)
    const response = await fetch('/api/order-notifications/sound',{method:'POST',body:form})
    if (!response.ok) setError(t('orderNotifications.invalidSound'))
    else { setMessage(t('orderNotifications.soundSaved')); chooseSound(null); await load() }
    setBusy(false)
  }
  const removeSound = async () => {
    setBusy(true); const response = await fetch('/api/order-notifications/sound',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyId})})
    if (!response.ok) setError(t('orderNotifications.saveFailed'))
    else { setMessage(t('orderNotifications.soundRemoved')); await load() }
    setBusy(false)
  }

  const permissionLabel = permission === 'granted' ? t('orderNotifications.allowed') : permission === 'denied' ? t('orderNotifications.blocked') : t('orderNotifications.notRequested')
  const activeDevice = settings?.devices.find((device) => device.id === settings.activeDeviceId)

  return <Card className="mt-5">
    <CardHeader><CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />{t('orderNotifications.title')}</CardTitle></CardHeader>
    <CardContent className="space-y-6">
      <p className="text-sm text-slate-600">{t('orderNotifications.description')}</p>
      {message && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3"><p className="text-xs text-slate-500">{t('orderNotifications.status')}</p><p className="font-medium">{settings?.enabled ? t('orderNotifications.enabled') : t('orderNotifications.disabled')}</p></div>
        <div className="rounded-md border p-3"><p className="text-xs text-slate-500">{t('orderNotifications.alertDevice')}</p><p className="font-medium">{activeDevice?.label || t('orderNotifications.noDevice')}</p></div>
        <div className="rounded-md border p-3"><p className="text-xs text-slate-500">{t('orderNotifications.permission')}</p><p className="font-medium">{permissionLabel}</p></div>
      </div>

      {!capability.supported && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t('orderNotifications.unsupported')}</p>}
      {capability.iosInstallRequired && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t('orderNotifications.iosInstall')}</p>}
      {!settings?.vapidPublicKey && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t('orderNotifications.schemaNotice')}</p>}

      {!consenting ? <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={()=>setConsenting(true)} disabled={busy||!capability.supported||capability.iosInstallRequired||!settings?.vapidPublicKey}><Smartphone className="h-4 w-4" />{t('orderNotifications.enableDevice')}</Button>
        {settings?.enabled && <Button type="button" variant="outline" onClick={()=>void sendTest()} disabled={busy}>{t('orderNotifications.test')}</Button>}
        {settings?.enabled && <Button type="button" variant="outline" onClick={()=>void update({action:'disable'},t('orderNotifications.disabledSuccess'))} disabled={busy}>{t('orderNotifications.disable')}</Button>}
      </div> : <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
        <p className="font-medium text-blue-950">{t('orderNotifications.consentTitle')}</p><p className="mt-1 text-sm text-blue-900">{t('orderNotifications.consentText')}</p>
        <label className="mt-3 block space-y-1"><span className="text-sm font-medium">{t('orderNotifications.deviceLabel')}</span><input value={deviceLabel} onChange={(e)=>setDeviceLabel(e.target.value)} maxLength={80} className="w-full rounded-md border bg-white px-3 py-2" placeholder={t('orderNotifications.devicePlaceholder')} /></label>
        <div className="mt-3 flex gap-2"><Button type="button" onClick={()=>void registerDevice()} disabled={busy||!deviceLabel.trim()}>{t('orderNotifications.continue')}</Button><Button type="button" variant="outline" onClick={()=>setConsenting(false)}>{t('orderNotifications.cancel')}</Button></div>
      </div>}

      {settings && settings.devices.length>0 && <section><h3 className="font-medium">{t('orderNotifications.registeredDevices')}</h3><div className="mt-2 grid gap-2">
        {settings.devices.map((device)=><div key={device.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{device.label} {device.isCurrent&&<span className="text-xs text-blue-700">· {t('orderNotifications.currentDevice')}</span>}</p><p className="text-xs text-slate-500">{device.platform} · {device.status==='invalid'?t('orderNotifications.needsAttention'):device.id===settings.activeDeviceId?t('orderNotifications.activeDevice'):t('orderNotifications.disabled')}</p></div>{device.status==='enabled'&&device.id!==settings.activeDeviceId&&<Button type="button" size="sm" variant="outline" onClick={()=>void update({action:'select_device',deviceId:device.id},t('orderNotifications.enabledSuccess'))} disabled={busy}>{t('orderNotifications.makeActive')}</Button>}</div>)}
      </div></section>}

      <section className="space-y-3 border-t pt-5"><h3 className="flex items-center gap-2 font-medium"><Volume2 className="h-4 w-4" />{t('orderNotifications.foregroundSound')}</h3><p className="text-sm text-slate-600">{t('orderNotifications.soundHint')}</p><p className="text-sm"><span className="font-medium">{t('orderNotifications.backgroundSound')}:</span> {t('orderNotifications.systemDefault')}</p><p className="text-xs text-slate-500">{t('orderNotifications.systemHint')}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings?.sound.enabled ?? true} onChange={(event)=>void update({action:'set_sound_enabled',enabled:event.target.checked},t('orderNotifications.soundSettingSaved'))} disabled={busy||!settings} />{t('orderNotifications.foregroundSoundEnabled')}</label>
        <input type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" onChange={(e)=>chooseSound(e.target.files?.[0]||null)} className="block w-full text-sm" aria-label={t('orderNotifications.chooseSound')} />
        {(soundFile||settings?.sound.hasCustom)&&<div className="flex flex-wrap items-center gap-2"><span className="text-sm">{soundFile?.name||settings?.sound.name}</span><Button type="button" size="sm" variant="outline" onClick={()=>void playSound()}><Play className="h-4 w-4" />{t('orderNotifications.play')}</Button><Button type="button" size="sm" variant="outline" onClick={()=>{audioRef.current?.pause();if(audioRef.current)audioRef.current.currentTime=0}}><Square className="h-4 w-4" />{t('orderNotifications.stop')}</Button>{soundFile&&<Button type="button" size="sm" onClick={()=>void uploadSound()} disabled={busy}><Upload className="h-4 w-4" />{t('orderNotifications.uploadSound')}</Button>}{settings?.sound.hasCustom&&!soundFile&&<Button type="button" size="sm" variant="outline" onClick={()=>void removeSound()} disabled={busy}>{t('orderNotifications.removeSound')}</Button>}</div>}
      </section>

      <section className="space-y-3 border-t pt-5"><h3 className="font-medium">{t('orderNotifications.webhookTitle')}</h3><p className="text-sm text-slate-600">{t('orderNotifications.webhookDescription')}</p>
        {!wooConnected||!settings?.wooCommerce.connected?<p className="text-sm text-amber-800">{t('orderNotifications.noWoo')}</p>:<><p className="text-sm"><span className="font-medium">{settings.wooCommerce.webhookConfigured?t('orderNotifications.webhookConfigured'):t('orderNotifications.webhookNotConfigured')}</span> · {t('orderNotifications.webhookTopic')}</p>{settings.wooCommerce.webhookUrl&&<div><p className="text-xs font-medium text-slate-500">{t('orderNotifications.webhookUrl')}</p><code className="block break-all rounded bg-slate-100 p-2 text-xs">{settings.wooCommerce.webhookUrl}</code></div>}{webhookSecret&&<div className="rounded-md border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-950">{t('orderNotifications.webhookSecretOnce')}</p><code className="mt-2 block break-all text-xs">{webhookSecret}</code><Button type="button" size="sm" variant="outline" className="mt-2" onClick={()=>void navigator.clipboard.writeText(webhookSecret)}><Clipboard className="h-4 w-4" />{t('orderNotifications.copy')}</Button></div>}<Button type="button" variant="outline" onClick={()=>void generateWebhook()} disabled={busy}><RotateCw className="h-4 w-4" />{settings.wooCommerce.webhookConfigured?t('orderNotifications.rotateWebhook'):t('orderNotifications.generateWebhook')}</Button></>}
      </section>
    </CardContent>
  </Card>
}
