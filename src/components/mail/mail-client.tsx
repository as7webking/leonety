'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, MailPlus, RefreshCw, Reply, Send } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { intlLocaleMap } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { mailRouteHref, parseMailRoute, type MailMessageRoute, type MailRouteState } from '@/lib/mailbox/navigation'
import { refreshMailView, type MailView } from '@/lib/mailbox/refresh'
import type { MailboxFilter, MailboxMessage, MailboxMessageSummary } from '@/lib/mailbox/types'

interface Connection {
  id: string
  provider: 'google' | 'microsoft' | 'imap'
  email: string
  displayName: string | null
  status: 'connected' | 'reconnect_required' | 'error' | 'disabled' | 'plan_restricted'
}

interface PageData {
  messages: MailboxMessageSummary[]
  nextCursor: string | null
  failedMailboxCount?: number
}

export function MailClient({ companyId }: { companyId: string }) {
  const { t, locale } = useI18n()
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionsLoadedFor, setConnectionsLoadedFor] = useState<string | null>(null)
  const [connectionsLoadFailed, setConnectionsLoadFailed] = useState(false)
  const [connectionId, setConnectionId] = useState('all')
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [filter, setFilter] = useState<MailboxFilter>('all')
  const [routeReady, setRouteReady] = useState(false)
  const [requestedMessage, setRequestedMessage] = useState<MailMessageRoute | null>(null)
  const [page, setPage] = useState<PageData>({ messages: [], nextCursor: null })
  const [message, setMessage] = useState<MailboxMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [composeConnectionId, setComposeConnectionId] = useState('')
  const refreshInFlight = useRef(false)

  const loadConnections = useCallback(async () => {
    const response = await fetch(`/api/mail/connections?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
    const available = body.connections as Connection[]
    const connected = available.filter((item) => item.status === 'connected')
    setConnections(available)
    setConnectionsLoadFailed(false)
    setConnectionId((current) => current === 'all' || connected.some((item) => item.id === current) ? current : 'all')
    setConnectionsLoadedFor(companyId)
    return available
  }, [companyId])

  const loadMessages = useCallback(async (nextCursor: string | null = null, options?: { view?: MailView; preserveOnError?: boolean }) => {
    setLoading(true); setError('')
    try {
      const view = options?.view ?? { connectionId, folder, filter }
      const params = new URLSearchParams({ companyId, connectionId: view.connectionId, folder: view.folder })
      if (view.filter === 'unread' && view.folder === 'inbox') params.set('filter', 'unread')
      if (nextCursor) params.set('cursor', nextCursor)
      const response = await fetch(`/api/mail/messages?${params}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
      setPage((current) => nextCursor
        ? { ...body, messages: [...current.messages, ...(body.messages ?? [])] }
        : body as PageData)
    } catch (caught) {
      setError(errorKey(caught))
      if (!options?.preserveOnError) setPage({ messages: [], nextCursor: null })
    } finally { setLoading(false) }
  }, [companyId, connectionId, folder, filter])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/mail/connections?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
        if (!cancelled) {
          const available = body.connections as Connection[]
          const connected = available.filter((item) => item.status === 'connected')
          setConnections(available)
          setConnectionsLoadFailed(false)
          setConnectionId((current) => current === 'all' || connected.some((item) => item.id === current) ? current : 'all')
          setConnectionsLoadedFor(companyId)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(connectionErrorKey(caught))
          setConnectionsLoadFailed(true)
          setConnectionsLoadedFor(companyId)
          setPage({ messages: [], nextCursor: null })
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [companyId])

  const connectionsReady = connectionsLoadedFor === companyId
  const visibleConnections = useMemo(() => connectionsReady ? connections.filter((item) => item.status === 'connected') : [], [connectionsReady, connections])
  const applyRoute = useCallback((route: MailRouteState) => {
    setConnectionId(route.mailboxId)
    setFolder(route.folder)
    setFilter(route.filter)
    setRequestedMessage(route.message)
    setMessage(null)
    setPage({ messages: [], nextCursor: null })
    setRouteReady(true)
  }, [])

  useEffect(() => {
    applyRoute(parseMailRoute(window.location.search))
    const handlePopState = () => applyRoute(parseMailRoute(window.location.search))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [applyRoute])

  const writeRoute = useCallback((next: MailRouteState, replace = false, marker = false) => {
    const href = mailRouteHref(next)
    window.history[replace ? 'replaceState' : 'pushState'](marker ? { leonetyMailMessage: true } : {}, '', href)
  }, [])

  useEffect(() => {
    if (connectionsReady && !connectionsLoadFailed && routeReady && !requestedMessage) void loadMessages(null)
  }, [connectionsReady, connectionsLoadFailed, routeReady, requestedMessage, loadMessages])

  const refreshAll = async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    setError('')
    const currentView: MailView = { connectionId, folder, filter }
    try {
      const available = await loadConnections()
      setConnectionsLoadFailed(false)
      const result = await refreshMailView({
        view: currentView,
        connections: available,
        reloadMessages: (view) => {
          if (view.connectionId !== currentView.connectionId) return Promise.resolve()
          return requestedMessage
            ? fetchMessage(requestedMessage, undefined, true)
            : loadMessages(null, { view, preserveOnError: true })
        },
      })
      if (result.view.connectionId !== currentView.connectionId) {
        setConnectionId(result.view.connectionId)
        const route = { mailboxId: result.view.connectionId, folder, filter, message: null }
        writeRoute(route, true)
      }
    } catch (caught) {
      setError(connectionErrorKey(caught))
      setLoading(false)
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }

  const fetchMessage = useCallback(async (route: MailMessageRoute, signal?: AbortSignal, preserveOnError = false) => {
    setBusy(true); setError('')
    if (!preserveOnError) setMessage(null)
    try {
      const params = new URLSearchParams({
        companyId, connectionId: route.connectionId, id: route.messageId,
        provider: route.provider, folder: route.folder,
      })
      const response = await fetch(`/api/mail/message?${params}`, { cache: 'no-store', signal })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_provider_error')
      setMessage(body.message as MailboxMessage)
    } catch (caught) {
      if (!signal?.aborted) setError(messageErrorKey(caught))
    } finally {
      if (!signal?.aborted) setBusy(false)
    }
  }, [companyId])

  useEffect(() => {
    if (!connectionsReady || connectionsLoadFailed || !routeReady || !requestedMessage) return
    const requestedConnection = connections.find((connection) => connection.id === requestedMessage.connectionId && connection.provider === requestedMessage.provider)
    if (!requestedConnection || requestedConnection.status === 'disabled' || requestedConnection.status === 'plan_restricted') {
      setError('mail.error.message_mailbox_unavailable')
      return
    }
    if (requestedConnection.status === 'reconnect_required') {
      setError('mail.error.reconnect')
      return
    }
    if (requestedConnection.status !== 'connected') {
      setError('mail.error.mailbox_provider_error')
      return
    }
    const controller = new AbortController()
    void fetchMessage(requestedMessage, controller.signal)
    return () => controller.abort()
  }, [connectionsReady, connectionsLoadFailed, routeReady, requestedMessage, connections, fetchMessage])

  const openMessage = (item: MailboxMessageSummary) => {
    const identity: MailMessageRoute = {
      connectionId: item.connectionId,
      provider: item.provider,
      messageId: item.providerMessageId,
      folder: item.folder,
    }
    setRequestedMessage(identity)
    writeRoute({ mailboxId: connectionId, folder, filter, message: identity }, false, true)
  }

  const backToList = () => {
    if (window.history.state?.leonetyMailMessage) {
      window.history.back()
      return
    }
    const route = { mailboxId: connectionId, folder, filter, message: null }
    writeRoute(route, true)
    applyRoute(route)
  }

  const updateListRoute = (next: Partial<Pick<MailRouteState, 'mailboxId' | 'folder' | 'filter'>>) => {
    const route: MailRouteState = {
      mailboxId: next.mailboxId ?? connectionId,
      folder: next.folder ?? folder,
      filter: next.filter ?? filter,
      message: null,
    }
    setMessage(null)
    setRequestedMessage(null)
    setConnectionId(route.mailboxId)
    setFolder(route.folder)
    setFilter(route.filter)
    setPage({ messages: [], nextCursor: null })
    writeRoute(route)
  }

  const performAction = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/mail/actions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, ...body }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'mailbox_provider_error')
      return true
    } catch (caught) { setError(errorKey(caught)); return false } finally { setBusy(false) }
  }

  const openCompose = (reply?: MailboxMessage) => {
    const defaultConnection = reply?.connectionId || reply?.mailboxId || (connectionId === 'all' ? visibleConnections[0]?.id : connectionId) || ''
    setComposeConnectionId(defaultConnection)
    setReplyingTo(reply?.providerMessageId ?? null)
    setTo(reply ? reply.from.email : '')
    setCc('')
    setSubject(reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : '')
    setText('')
    setComposeOpen(true)
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const selected = composeConnectionId
    if (!selected) { setError('mail.error.mailbox_not_connected'); return }
    const recipients = splitAddresses(to)
    const ccRecipients = splitAddresses(cc)
    const success = await performAction({
      action: replyingTo ? 'reply' : 'send', connectionId: selected,
      to: recipients, cc: ccRecipients, subject, text,
      ...(replyingTo ? { replyToMessageId: replyingTo } : {}),
    })
    if (success) {
      setComposeOpen(false); setNotice(replyingTo ? 'mail.replySuccess' : 'mail.sentSuccess')
      setTo(''); setCc(''); setSubject(''); setText(''); setReplyingTo(null)
      if (folder === 'sent') await loadMessages(null)
    }
  }

  const markRead = async () => {
    if (!message) return
    const success = await performAction({ action: 'mark_read', connectionId: message.connectionId, folder: message.folder, messageId: message.providerMessageId, read: !message.isRead })
    if (success) {
      setMessage({ ...message, isRead: !message.isRead })
      if (filter === 'unread' && message.folder === 'inbox' && !message.isRead) {
        setPage((current) => ({ ...current, messages: current.messages.filter((item) => item.providerMessageId !== message.providerMessageId || item.connectionId !== message.connectionId) }))
      }
    }
  }

  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(intlLocaleMap[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : ''

  if (connectionsReady && !visibleConnections.length && !loading && !error) return <Card className="min-w-0 p-5">
    <p className="font-medium">{connections.length ? t('mail.mailboxesNeedAttention') : t('mail.noConnectedMailboxes')}</p>
    <p className="mt-1 text-sm text-muted-foreground">{t('mail.settingsDescription')}</p>
    {connections.length > 0 && <ul className="mt-3 space-y-2 text-sm">{connections.map((item) => <li key={item.id} className="min-w-0 break-all">{item.email} · {providerName(item.provider)} · {t(`mail.status.${item.status}`)}</li>)}</ul>}
    <Button asChild variant="outline" className="mt-4"><Link href="/app/settings/mailbox">{connections.length ? t('mail.settingsTitle') : t('mail.connectMailbox')}</Link></Button>
  </Card>

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap gap-2">
        <label className="sr-only" htmlFor="mailbox-select">{t('mail.selectMailbox')}</label>
        <select id="mailbox-select" className="h-10 max-w-full min-w-[160px] rounded-md border bg-background px-3 text-sm" value={connectionId} onChange={(event) => updateListRoute({ mailboxId: event.target.value })}>
          <option value="all">{t('mail.allInboxes')}</option>
          {visibleConnections.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
        </select>
        <div className="inline-flex rounded-md border p-1" role="tablist" aria-label={t('mail.title')}>
          {(['inbox', 'unread', 'sent'] as const).map((value) => {
            const selected = value === 'unread' ? folder === 'inbox' && filter === 'unread' : folder === value && filter === 'all'
            return <button key={value} type="button" role="tab" aria-selected={selected} onClick={() => updateListRoute(value === 'unread' ? { folder: 'inbox', filter: 'unread' } : { folder: value, filter: 'all' })} className={`rounded px-3 py-1.5 text-sm ${selected ? 'bg-muted font-medium' : ''}`}>{t(`mail.${value}`)}</button>
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={t('common.tryAgain')} title={t('common.tryAgain')} disabled={loading || refreshing} onClick={() => void refreshAll()}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></Button>
        <Button type="button" onClick={() => openCompose()} disabled={!visibleConnections.length}><MailPlus className="mr-2 h-4 w-4" />{t('mail.compose')}</Button>
      </div>
    </div>

    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{t(notice)}</p>}
    {connections.length > 0 && <section aria-label={t('mail.settingsTitle')} className="min-w-0 rounded-md border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t('mail.settingsTitle')}</h2><Button asChild size="sm" variant="outline"><Link href="/app/settings/mailbox">{t('mail.manageMailboxes')}</Link></Button></div>
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2">{connections.map((item) => <li key={item.id} className="min-w-0 rounded-md bg-muted/40 px-3 py-2 text-sm">
        <p className="break-all font-medium">{item.email}</p>
        <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{providerName(item.provider)}</span><span>{t(`mail.status.${item.status}`)}</span></p>
      </li>)}</ul>
    </section>}
    {page.failedMailboxCount ? <p className="text-sm text-amber-800">{t('mail.failedInboxes')}</p> : null}

    {message ? <Card className="min-w-0 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2" onClick={backToList}><ArrowLeft className="mr-2 h-4 w-4" />{t('mail.back')}</Button>
        <h2 className="break-words text-lg font-semibold">{message.subject || '(no subject)'}</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">{message.from.name ? `${message.from.name} ` : ''}&lt;{message.from.email}&gt;</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">{t('mail.to')}: {message.to.join(', ')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{message.mailboxEmail} · {formatDate(message.receivedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void markRead()}>{message.isRead ? t('mail.markUnread') : t('mail.markRead')}</Button>
          <Button type="button" size="sm" onClick={() => openCompose(message)}><Reply className="mr-2 h-4 w-4" />{t('mail.reply')}</Button>
        </div>
      </div>
      {message.hasAttachments && <p className="mb-3 text-xs text-muted-foreground">{t('mail.attachments')}</p>}
      <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">{message.textBody || t('mail.noBody')}</pre>
    </Card> : requestedMessage ? <Card className="flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {busy && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />}
        <span>{busy ? t('mail.loading') : t(error || 'mail.error.message_mailbox_unavailable')}</span>
      </div>
      <div className="flex shrink-0 gap-2">
        {!busy && error === 'mail.error.reconnect'
          ? <Button asChild type="button" variant="outline" size="sm"><Link href="/app/settings/mailbox">{t('mail.reconnect')}</Link></Button>
          : !busy && <Button type="button" variant="outline" size="sm" onClick={() => void fetchMessage(requestedMessage)}>{t('common.tryAgain')}</Button>}
        <Button type="button" variant="ghost" size="sm" onClick={backToList}><ArrowLeft className="mr-2 h-4 w-4" />{t('mail.back')}</Button>
      </div>
    </Card> : <div className="space-y-2">
      {loading && <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />{t('mail.loading')}</p>}
      {!loading && !error && !page.failedMailboxCount && !page.messages.length && <Card className="p-5 text-sm text-muted-foreground">{t('mail.noMessages')}</Card>}
      {page.messages.map((item) => <button key={`${item.connectionId}:${item.provider}:${item.providerMessageId}:${item.folder}`} type="button" onClick={() => openMessage(item)} className="block w-full min-w-0 rounded-md border bg-card p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`truncate text-sm ${item.isRead ? 'font-normal' : 'font-semibold'}`}>{item.from.name || item.from.email}</p>
            <p className={`mt-0.5 truncate text-sm ${item.isRead ? '' : 'font-medium'}`}>{item.subject || '(no subject)'}</p>
            <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{item.snippet}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.mailboxEmail}{item.hasAttachments ? ` · ${t('mail.attachments')}` : ''}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{formatDate(item.receivedAt)}</time>
        </div>
      </button>)}
      {page.nextCursor && <Button type="button" variant="outline" disabled={loading} onClick={() => void loadMessages(page.nextCursor)}>{t('mail.nextPage')}</Button>}
    </div>}

    {composeOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false) }}>
      <form onSubmit={send} className="max-h-[calc(94dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-2xl overflow-auto rounded-lg border bg-background p-4 shadow-xl sm:max-h-[94dvh] sm:p-6" aria-label={t('mail.compose')}>
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold">{replyingTo ? t('mail.reply') : t('mail.compose')}</h2><Button type="button" variant="ghost" size="sm" onClick={() => setComposeOpen(false)}>{t('common.cancel')}</Button></div>
        <label className="mb-3 block text-sm">{t('mail.from')}<select value={composeConnectionId} disabled={Boolean(replyingTo)} onChange={(event) => setComposeConnectionId(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3">{visibleConnections.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
        <label className="mb-3 block text-sm">{t('mail.to')}<input required type="text" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3" /></label>
        <label className="mb-3 block text-sm">{t('mail.cc')}<input type="text" value={cc} onChange={(event) => setCc(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3" /></label>
        <label className="mb-3 block text-sm">{t('mail.subject')}<input required type="text" value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3" /></label>
        <label className="mb-4 block text-sm">{t('mail.message')}<textarea required rows={8} value={text} onChange={(event) => setText(event.target.value)} className="mt-1 w-full min-w-0 resize-y rounded-md border bg-background p-3" /></label>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{t(error)}</p>}
        <Button type="submit" disabled={busy || !visibleConnections.length}>{busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{busy ? t('mail.sending') : t('mail.send')}</Button>
      </form>
    </div>}
  </div>
}

function splitAddresses(value: string) {
  return value.split(/[;,]/).map((part) => part.trim()).filter(Boolean)
}

function errorKey(error: unknown) {
  const code = error instanceof Error ? error.message : 'mailbox_provider_error'
  if (code === 'message_not_found') return 'mail.error.message_mailbox_unavailable'
  if (code === 'provider_error' || code === 'invalid_request') return 'mail.error.mailbox_provider_error'
  if (code === 'mailbox_not_found' || code === 'message_identity_mismatch') return 'mail.error.message_mailbox_unavailable'
  if (code === 'reconnect_required') return 'mail.error.reconnect'
  if (code === 'mailbox_load_failed') return 'mail.loadFailed'
  if (code === 'workspace_access_denied') return 'mail.error.workspace'
  if (code === 'invalid_message') return 'mail.error.mailbox_provider_error'
  const known = ['mailbox_limit_reached', 'mailbox_not_connected', 'mailbox_provider_error', 'reconnect_required', 'rate_limited', 'provider_unavailable', 'mailbox_load_failed']
  return known.includes(code) ? `mail.error.${code}` : code.startsWith('mail.error.') ? code : 'mail.error.mailbox_provider_error'
}

function connectionErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : 'mailbox_load_failed'
  if (code === 'mailbox_load_failed') return 'mail.error.mailbox_load_failed'
  return errorKey(error)
}

function messageErrorKey(error: unknown) {
  const code = error instanceof Error ? error.message : 'mailbox_provider_error'
  if (['message_not_found', 'mailbox_not_found', 'mailbox_not_connected', 'message_identity_mismatch', 'invalid_message'].includes(code)) {
    return 'mail.error.message_mailbox_unavailable'
  }
  return errorKey(error)
}

function providerName(provider: Connection['provider']) {
  return provider === 'google' ? 'Gmail / Google Workspace' : provider === 'microsoft' ? 'Microsoft 365 / Outlook' : 'IMAP/SMTP'
}
