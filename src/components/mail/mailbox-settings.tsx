'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, LoaderCircle, Mail, ShieldCheck, Star, Unplug } from 'lucide-react'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { intlLocaleMap } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase-client'
import { mailboxDefaultStorageKey, readBrowserDefaultMailboxId, resolveDefaultMailboxId, writeBrowserDefaultMailboxId } from '@/lib/mailbox/default-preference'

interface Connection {
  id: string
  provider: 'google' | 'microsoft' | 'imap'
  email: string
  displayName: string | null
  status: 'connected' | 'reconnect_required' | 'error' | 'disabled' | 'plan_restricted'
  restrictionReason: 'free_email_required' | 'free_email_mismatch' | null
  reason: 'missing_scope' | 'authorization_revoked' | null
  createdAt: string
  lastSuccessfulConnectionAt: string | null
}

interface SettingsData {
  connections: Connection[]
  plan: string
  limit: number
  activeCount: number
  canConnect: boolean
  freeEmailReady: boolean
  canonicalVerifiedEmail: string | null
}

const initialImap = {
  email: '', displayName: '', imapHost: '', imapPort: 993 as const, imapSecurity: 'tls' as const,
  smtpHost: '', smtpPort: 465 as 465 | 587, smtpSecurity: 'tls' as 'tls' | 'starttls', username: '', password: '',
}

export function MailboxSettings() {
  const { currentCompany } = useCompany()
  const { t, locale } = useI18n()
  const searchParams = useSearchParams()
  const [data, setData] = useState<SettingsData | null>(null)
  const [authUserId, setAuthUserId] = useState('')
  const authUserRef = useRef('')
  const authEventVersion = useRef(0)
  const companyIdRef = useRef(currentCompany?.id ?? '')
  companyIdRef.current = currentCompany?.id ?? ''
  const [defaultMailboxId, setDefaultMailboxId] = useState('')
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showImap, setShowImap] = useState(false)
  const [imap, setImap] = useState(initialImap)
  const [tested, setTested] = useState(false)
  const [testResults, setTestResults] = useState<{ imap: { ok: boolean; error?: string }; smtp: { ok: boolean; error?: string } } | null>(null)

  const load = useCallback(async () => {
    const companyId = currentCompany?.id
    const userId = authUserRef.current
    if (!companyId || !userId) return
    const response = await fetch(`/api/mail/connections?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
    if (authUserRef.current !== userId || companyIdRef.current !== companyId) return
    const result = body as SettingsData
    setData(result)
    const key = mailboxDefaultStorageKey(userId, companyId)
    const preferred = readBrowserDefaultMailboxId(key)
    const resolved = resolveDefaultMailboxId(preferred, result.connections)
    setDefaultMailboxId(resolved)
    if (preferred !== resolved) writeBrowserDefaultMailboxId(key, resolved || null)
  }, [currentCompany?.id])

  useEffect(() => {
    let active = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authEventVersion.current += 1
      const nextId = session?.user.id ?? ''
      if (authUserRef.current === nextId) return
      authUserRef.current = nextId
      setAuthUserId(nextId); setData(null); setDefaultMailboxId(''); setError('')
      setImap(initialImap); setShowImap(false); setTested(false); setTestResults(null)
    })
    const initialVersion = authEventVersion.current
    void supabase.auth.getUser().then(({ data: authData }) => {
      if (!active || authEventVersion.current !== initialVersion) return
      const userId = authData.user?.id ?? ''
      authUserRef.current = userId
      setAuthUserId(userId)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [supabase])

  useEffect(() => {
    if (!currentCompany?.id || !authUserId) return
    let cancelled = false
    void load().catch((caught: unknown) => { if (!cancelled) setError(errorKey(caught)) })
    return () => { cancelled = true }
  }, [currentCompany?.id, authUserId, load])

  useEffect(() => {
    const value = searchParams.get('mailError')
    if (value) setError(`mail.error.${value}`)
    else if (searchParams.get('mailConnected')) setNotice('mail.imap.saved')
  }, [searchParams])

  const connectOAuth = (provider: 'google' | 'microsoft') => {
    if (!currentCompany?.id) return
    window.location.href = `/api/mail/oauth/${provider}/start?companyId=${encodeURIComponent(currentCompany.id)}`
  }

  const testImap = async () => {
    if (!currentCompany?.id) return
    setBusy(true); setError(''); setTestResults(null); setTested(false)
    try {
      const response = await fetch('/api/mail/connections/test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...imap, companyId: currentCompany.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'mailbox_connection_test_failed')
      setTestResults(result)
      setTested(Boolean(result.imap?.ok && result.smtp?.ok))
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
  }

  const saveImap = async () => {
    if (!currentCompany?.id || !tested) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/mail/connections', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...imap, companyId: currentCompany.id }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        if (result?.imap && result?.smtp) setTestResults(result)
        throw new Error(result?.error || 'mailbox_connection_test_failed')
      }
      setImap(initialImap); setTested(false); setTestResults(null); setShowImap(false)
      setNotice('mail.imap.saved'); await load()
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
  }

  const updateConnection = async (connection: Connection, action: 'activate' | 'restrict') => {
    if (!currentCompany?.id) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/mail/connections/${connection.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id, action }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_update_failed')
      await load()
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
  }

  const testSaved = async (connection: Connection) => {
    if (!currentCompany?.id) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/mail/connections/${connection.id}/test`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId: currentCompany.id }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_test_failed')
      setNotice('mail.testSuccess'); await load()
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
  }

  const disconnect = async (connection: Connection) => {
    if (!currentCompany?.id || !window.confirm(t('mail.disconnectConfirm'))) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/mail/connections/${connection.id}?companyId=${encodeURIComponent(currentCompany.id)}`, { method: 'DELETE' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_disconnect_failed')
      await load()
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
  }

  const setDefault = (connectionId: string) => {
    if (!authUserId || !currentCompany?.id) return
    const key = mailboxDefaultStorageKey(authUserId, currentCompany.id)
    if (writeBrowserDefaultMailboxId(key, connectionId)) setDefaultMailboxId(connectionId)
    else setError('mail.error.default_save_failed')
  }

  const updateImap = (key: keyof typeof initialImap, value: string | number) => {
    setTested(false); setTestResults(null)
    setImap((current) => ({ ...current, [key]: value }))
  }

  const hasSlot = data?.canConnect ?? true
  const canStartConnection = Boolean(data && hasSlot && (data.plan !== 'free' || data.freeEmailReady))
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{t('mail.settingsTitle')}</CardTitle>
          <CardDescription>{t('mail.settingsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-b pb-4 text-sm">
            <p className="font-medium">{t('mail.accountEmail')}</p>
            <p className="mt-1 break-all text-muted-foreground">{data?.canonicalVerifiedEmail || t('mail.accountEmailUnverified')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('mail.accountEmailNote')}</p>
          </div>
          {data && <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4 text-sm">
            <span>{t('mail.limit')}: {data.activeCount} / {data.limit}</span>
            <span className="capitalize">{t('mail.planSummary').replace('{plan}', data.plan)}</span>
          </div>}
          {data?.plan === 'free' && <p className="text-sm text-muted-foreground">{t('mail.freePlan')}</p>}
          {data?.plan === 'free' && !data.freeEmailReady && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t('mail.freeEmailRequired')}</p>}
          {data && !hasSlot && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <span>{t('mail.limitReached')}</span><Button asChild size="sm"><Link href="/upgrade">{t('mail.upgrade')}</Link></Button>
          </div>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!canStartConnection || busy} onClick={() => connectOAuth('google')}><Mail className="mr-2 h-4 w-4" />{t('mail.connectGoogle')}</Button>
            <Button type="button" variant="outline" disabled={!canStartConnection || busy} onClick={() => connectOAuth('microsoft')}><Mail className="mr-2 h-4 w-4" />{t('mail.connectMicrosoft')}</Button>
            <Button type="button" variant="outline" disabled={!canStartConnection || busy} onClick={() => setShowImap((open) => !open)}><ShieldCheck className="mr-2 h-4 w-4" />{t('mail.connectOther')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('mail.defaultDeviceNote')}</p>
          {showImap && <div className="space-y-4 rounded-md border p-4">
            <div><h3 className="font-medium">{t('mail.imap.title')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('mail.imap.description')}</p></div>
            <h4 className="text-sm font-medium">{t('mail.imap.mailbox')}</h4>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field disabled={busy} label={t('mail.imap.email')} value={imap.email} onChange={(value) => updateImap('email', value)} type="email" autoComplete="email" />
              <Field disabled={busy} label={t('mail.imap.displayName')} value={imap.displayName} onChange={(value) => updateImap('displayName', value)} />
              <Field disabled={busy} label={t('mail.imap.password')} value={imap.password} onChange={(value) => updateImap('password', value)} type="password" autoComplete="new-password" />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">{t('mail.imap.displayNameHelp')}</p>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t('mail.imap.incoming')}</h4>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field disabled={busy} label={t('mail.imap.imapHost')} value={imap.imapHost} onChange={(value) => updateImap('imapHost', value)} placeholder="imap.example.com" />
              <SelectField disabled={busy} label={t('mail.imap.imapPort')} value={imap.imapPort} onChange={() => updateImap('imapPort', 993)}>
                <option value={993}>993</option>
              </SelectField>
              <SelectField disabled={busy} label={t('mail.imap.imapSecurity')} value={imap.imapSecurity} onChange={() => updateImap('imapSecurity', 'tls')}>
                <option value="tls">TLS</option>
              </SelectField>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t('mail.imap.outgoing')}</h4>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field disabled={busy} label={t('mail.imap.smtpHost')} value={imap.smtpHost} onChange={(value) => updateImap('smtpHost', value)} placeholder="smtp.example.com" />
              <SelectField disabled={busy} label={t('mail.imap.smtpPort')} value={imap.smtpPort} onChange={(value) => {
                const port = Number(value) as 465 | 587
                updateImap('smtpPort', port)
                updateImap('smtpSecurity', port === 465 ? 'tls' : 'starttls')
              }}>
                <option value={465}>465</option><option value={587}>587</option>
              </SelectField>
              <SelectField disabled={busy} label={t('mail.imap.smtpSecurity')} value={imap.smtpSecurity} onChange={(value) => {
                const security = value as 'tls' | 'starttls'
                updateImap('smtpSecurity', security)
                updateImap('smtpPort', security === 'tls' ? 465 : 587)
              }}>
                <option value="tls">TLS</option><option value="starttls">STARTTLS</option>
              </SelectField>
              </div>
            </div>
            <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">{t('mail.imap.advanced')}</summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{t('mail.imap.usernameHelp')}</p>
                <Field disabled={busy} label={t('mail.imap.customUsername')} value={imap.username} onChange={(value) => updateImap('username', value)} autoComplete="username" />
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || !canStartConnection} onClick={testImap}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}{busy ? t('mail.testing') : t('mail.imap.test')}</Button>
              <Button type="button" disabled={busy || !tested || !canStartConnection} onClick={saveImap}>{busy ? t('mail.imap.saving') : t('mail.imap.save')}</Button>
            </div>
            {testResults && <div className="space-y-1 text-sm" role="status">
              <p>{testResults.imap.ok ? t('mail.imap.testImapOk') : `${t('mail.imap.testImapBad')}: ${t(`mail.error.${testResults.imap.error || 'provider_unavailable'}`)}`}</p>
              <p>{testResults.smtp.ok ? t('mail.imap.testSmtpOk') : `${t('mail.imap.testSmtpBad')}: ${t(`mail.error.${testResults.smtp.error || 'provider_unavailable'}`)}`}</p>
            </div>}
          </div>}
          {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
          {notice && <p role="status" className="text-sm text-emerald-700">{t(notice)}</p>}
          {!data && !error && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        </CardContent>
      </Card>

      {data?.connections.map((connection) => <Card key={connection.id}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-all font-medium">{connection.displayName || connection.email}</p>
            <p className="break-all text-sm text-muted-foreground">{connection.email} · {providerName(connection.provider)}</p>
            <p className="text-sm">{connection.restrictionReason ? t(`mail.error.${connection.restrictionReason}`) : t(`mail.status.${connection.status}`)}</p>
            {connection.reason && <p className="text-sm text-amber-700">{t(connection.reason === 'missing_scope' ? 'mail.error.missing_scope' : 'mail.error.reconnect')}</p>}
            {connection.lastSuccessfulConnectionAt && <p className="text-xs text-muted-foreground">{t('mail.lastConnection')}: {new Intl.DateTimeFormat(intlLocaleMap[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(connection.lastSuccessfulConnectionAt))}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {connection.status === 'connected' && <Button size="sm" variant={defaultMailboxId === connection.id ? 'secondary' : 'outline'} disabled={busy || defaultMailboxId === connection.id} onClick={() => setDefault(connection.id)}>
              <Star className="mr-1 h-4 w-4" />{defaultMailboxId === connection.id ? t('mail.defaultMailbox') : t('mail.setDefault')}
            </Button>}
            {connection.status === 'plan_restricted'
              ? <Button size="sm" variant="outline" disabled={busy || !hasSlot} onClick={() => updateConnection(connection, 'activate')}>{t('mail.activate')}</Button>
              : connection.status !== 'disabled' && <>
                {connection.status !== 'connected' && connection.provider !== 'imap' && <Button size="sm" variant="outline" disabled={busy} onClick={() => connectOAuth(connection.provider as 'google' | 'microsoft')}>{t('mail.reconnect')}</Button>}
                {connection.status === 'connected' && <Button size="sm" variant="outline" disabled={busy} onClick={() => testSaved(connection)}>{t('mail.test')}</Button>}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => updateConnection(connection, 'restrict')}>{t('mail.pause')}</Button>
              </>}
            {connection.status !== 'disabled' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => disconnect(connection)}><Unplug className="mr-1 h-4 w-4" />{t('mail.disconnect')}</Button>}
            {connection.status === 'connected' && <CheckCircle2 className="my-auto hidden h-4 w-4 text-emerald-600 sm:block" aria-label={t('mail.status.connected')} />}
          </div>
        </CardContent>
      </Card>)}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, autoComplete, disabled }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; disabled?: boolean
}) {
  return <label className="block min-w-0 text-sm">{label}<input disabled={disabled} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} maxLength={512} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3" /></label>
}

function SelectField({ label, value, onChange, disabled, children }: {
  label: string; value: string | number; onChange: (value: string) => void; disabled?: boolean; children: React.ReactNode
}) {
  return <label className="block min-w-0 text-sm">{label}<select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3">{children}</select></label>
}

function errorKey(error: unknown) {
  const code = error instanceof Error ? error.message : 'mailbox_connection_test_failed'
  return code.startsWith('mail.error.') ? code : `mail.error.${code}`
}

function providerName(provider: Connection['provider']) {
  return provider === 'google' ? 'Gmail / Google Workspace' : provider === 'microsoft' ? 'Microsoft' : 'IMAP/SMTP'
}
