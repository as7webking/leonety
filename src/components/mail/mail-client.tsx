'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, MailPlus, RefreshCw, Reply, Send } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { intlLocaleMap } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { MailboxMessage, MailboxMessageSummary } from '@/lib/mailbox/types'

interface Connection {
  id: string
  provider: 'google' | 'microsoft' | 'imap'
  email: string
  displayName: string | null
  status: string
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
  const [connectionId, setConnectionId] = useState('all')
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [page, setPage] = useState<PageData>({ messages: [], nextCursor: null })
  const [message, setMessage] = useState<MailboxMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    const response = await fetch(`/api/mail/connections?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
    const connected = (body.connections as Connection[]).filter((item) => item.status === 'connected')
    setConnections(connected)
    setConnectionId((current) => current === 'all' || connected.some((item) => item.id === current) ? current : 'all')
    setConnectionsLoadedFor(companyId)
  }, [companyId])

  const loadMessages = useCallback(async (nextCursor: string | null = null) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ companyId, connectionId, folder })
      if (nextCursor) params.set('cursor', nextCursor)
      const response = await fetch(`/api/mail/messages?${params}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
      setPage((current) => nextCursor
        ? { ...body, messages: [...current.messages, ...(body.messages ?? [])] }
        : body as PageData)
    } catch (caught) {
      setError(errorKey(caught)); setPage({ messages: [], nextCursor: null })
    } finally { setLoading(false) }
  }, [companyId, connectionId, folder])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/mail/connections?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'mailbox_load_failed')
        if (!cancelled) {
          const connected = (body.connections as Connection[]).filter((item) => item.status === 'connected')
          setConnections(connected)
          setConnectionId((current) => current === 'all' || connected.some((item) => item.id === current) ? current : 'all')
          setConnectionsLoadedFor(companyId)
        }
      })
      .catch((caught: unknown) => { if (!cancelled) { setError(errorKey(caught)); setConnectionsLoadedFor(companyId) } })
    return () => { cancelled = true }
  }, [companyId])

  const connectionsReady = connectionsLoadedFor === companyId
  const visibleConnections = connectionsReady ? connections : []
  useEffect(() => { if (connectionsReady) void loadMessages(null) }, [connectionsReady, loadMessages])

  const refreshAll = async () => {
    setError('')
    try { await loadConnections() } catch (caught) { setError(errorKey(caught)) }
    await loadMessages(null)
  }

  const openMessage = async (item: MailboxMessageSummary) => {
    setBusy(true); setError(''); setMessage(null)
    try {
      const params = new URLSearchParams({ companyId, connectionId: item.mailboxId, id: item.id, folder: item.folder })
      const response = await fetch(`/api/mail/message?${params}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'mailbox_provider_error')
      setMessage(body.message as MailboxMessage)
    } catch (caught) { setError(errorKey(caught)) } finally { setBusy(false) }
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
    setReplyingTo(reply?.id ?? null)
    setTo(reply ? reply.from.email : '')
    setCc('')
    setSubject(reply ? (/^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`) : '')
    setText('')
    setComposeOpen(true)
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    const selected = connectionId === 'all' ? visibleConnections[0]?.id : connectionId
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
    const success = await performAction({ action: 'mark_read', connectionId: message.mailboxId, folder: message.folder, messageId: message.id, read: !message.isRead })
    if (success) setMessage({ ...message, isRead: !message.isRead })
  }

  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(intlLocaleMap[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : ''

  if (connectionsReady && !visibleConnections.length && !loading) return <Card className="p-5">
    <p className="font-medium">{t('mail.noMessages')}</p>
    <p className="mt-1 text-sm text-muted-foreground">{t('mail.settingsDescription')}</p>
    <Button asChild variant="outline" className="mt-4"><a href="/app/settings/mailbox">{t('mail.settingsTitle')}</a></Button>
  </Card>

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap gap-2">
        <label className="sr-only" htmlFor="mailbox-select">{t('mail.selectMailbox')}</label>
        <select id="mailbox-select" className="h-10 max-w-full min-w-[160px] rounded-md border bg-background px-3 text-sm" value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setMessage(null) }}>
          <option value="all">{t('mail.allInboxes')}</option>
          {visibleConnections.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
        </select>
        <div className="inline-flex rounded-md border p-1" role="tablist" aria-label={t('mail.title')}>
          {(['inbox', 'sent'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={folder === value} onClick={() => { setFolder(value); setMessage(null) }} className={`rounded px-3 py-1.5 text-sm ${folder === value ? 'bg-muted font-medium' : ''}`}>{t(`mail.${value}`)}</button>)}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={t('common.tryAgain')} title={t('common.tryAgain')} disabled={loading} onClick={() => void refreshAll()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button type="button" onClick={() => openCompose()} disabled={!visibleConnections.length}><MailPlus className="mr-2 h-4 w-4" />{t('mail.compose')}</Button>
      </div>
    </div>

    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{t(notice)}</p>}
    {page.failedMailboxCount ? <p className="text-sm text-amber-800">{t('mail.failedInboxes')}</p> : null}

    {message ? <Card className="min-w-0 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => setMessage(null)}><ArrowLeft className="mr-2 h-4 w-4" />{t('mail.back')}</Button>
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
    </Card> : <div className="space-y-2">
      {loading && <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />{t('mail.loading')}</p>}
      {!loading && !page.messages.length && <Card className="p-5 text-sm text-muted-foreground">{t('mail.noMessages')}</Card>}
      {page.messages.map((item) => <button key={`${item.mailboxId}:${item.id}`} type="button" onClick={() => void openMessage(item)} className="block w-full min-w-0 rounded-md border bg-card p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

    {composeOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false) }}>
      <form onSubmit={send} className="max-h-[94dvh] w-full max-w-2xl overflow-auto rounded-lg border bg-background p-4 shadow-xl sm:p-6" aria-label={t('mail.compose')}>
        <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-semibold">{replyingTo ? t('mail.reply') : t('mail.compose')}</h2><Button type="button" variant="ghost" size="sm" onClick={() => setComposeOpen(false)}>{t('common.cancel')}</Button></div>
        <label className="mb-3 block text-sm">{t('mail.from')}<select value={connectionId === 'all' ? visibleConnections[0]?.id ?? '' : connectionId} onChange={(event) => setConnectionId(event.target.value)} className="mt-1 h-10 w-full min-w-0 rounded-md border bg-background px-3">{visibleConnections.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
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
  const known = ['mailbox_limit_reached', 'mailbox_not_connected', 'mailbox_provider_error', 'reconnect_required', 'rate_limited', 'provider_unavailable', 'mailbox_load_failed']
  return known.includes(code) ? `mail.error.${code}` : code.startsWith('mail.error.') ? code : 'mail.error.mailbox_provider_error'
}
