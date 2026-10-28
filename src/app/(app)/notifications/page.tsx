'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, FileText, Mail, Package, Plug, RefreshCw } from 'lucide-react'
import { LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { getIntlLocale } from '@/lib/i18n'
import { getNotificationCenterText } from '@/lib/notification-center-i18n'
import type { NotificationEvent, NotificationEventType } from '@/lib/notification-center'

type Filter = 'all' | 'unread'

const notificationIcons: Record<NotificationEventType, typeof Bell> = {
  invoice_overdue: FileText,
  low_stock: Package,
  product_sync_failed: RefreshCw,
  mailbox_reconnect: Mail,
  integration_error: Plug,
}

export default function NotificationsPage() {
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const companyId = currentCompany?.id ?? ''
  const [notifications, setNotifications] = useState<NotificationEvent[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState(false)
  const [busyId, setBusyId] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    if (!companyId) return
    const request = ++requestId.current
    setLoading(true)
    setLoadError('')
    setNotifications([])
    try {
      const response = await fetch(`/api/notification-center?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { notifications?: NotificationEvent[]; error?: string }
      if (!response.ok) throw new Error(payload.error === 'migration_required' ? 'migrationRequired' : 'loadError')
      if (request === requestId.current) setNotifications(payload.notifications ?? [])
    } catch (error) {
      if (request === requestId.current) setLoadError(error instanceof Error && error.message === 'migrationRequired' ? 'migrationRequired' : 'loadError')
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    if (companyId) void load()
  }, [companyId, load])

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications])
  const visibleNotifications = useMemo(
    () => filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications,
    [filter, notifications]
  )

  const updateReadState = async (action: 'read' | 'unread' | 'read_all', notificationId?: string) => {
    if (!companyId || busyId) return
    const key = notificationId ?? 'all'
    setBusyId(key)
    setActionError(false)
    try {
      const response = await fetch('/api/notification-center', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action, notificationId }),
      })
      if (!response.ok) throw new Error('update_failed')
      await load()
    } catch {
      setActionError(true)
    } finally {
      setBusyId('')
    }
  }

  if (companyLoading) return <PageContainer><PageHeader title={getNotificationCenterText(locale, 'title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer>
    <PageHeader title={getNotificationCenterText(locale, 'title')} />
    <p className="rounded-md border border-slate-200 p-5 text-sm text-slate-600">{t('common.noWorkspaceSelected')}</p>
  </PageContainer>

  return (
    <PageContainer>
      <PageHeader title={getNotificationCenterText(locale, 'title')} description={getNotificationCenterText(locale, 'description')} />

      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 gap-2" role="group" aria-label={getNotificationCenterText(locale, 'title')}>
          {(['all', 'unread'] as const).map((value) => (
            <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>
              {getNotificationCenterText(locale, value)}{value === 'unread' ? ` (${unreadCount})` : ''}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/app/settings/notifications">{getNotificationCenterText(locale, 'openSettings')}</Link></Button>
          {unreadCount > 0 && <Button size="sm" disabled={Boolean(busyId)} onClick={() => void updateReadState('read_all')}>
            {getNotificationCenterText(locale, 'markAllRead')}
          </Button>}
        </div>
      </div>

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{getNotificationCenterText(locale, loadError)}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>{getNotificationCenterText(locale, 'retry')}</Button>
          </div>
        </div>
      ) : loading ? (
        <LoadingSkeleton />
      ) : visibleNotifications.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 px-5 py-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm text-slate-600">{getNotificationCenterText(locale, 'empty')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {visibleNotifications.map((notification) => {
            const Icon = notificationIcons[notification.type]
            const message = getNotificationCenterText(locale, notification.messageKey, notification.label)
            const title = getNotificationCenterText(locale, notification.titleKey)
            const formattedDate = new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.timestamp))
            return (
              <li key={notification.id} className={`flex min-w-0 items-start gap-3 p-4 ${notification.read ? '' : 'bg-blue-50/60'}`}>
                <span className={`mt-0.5 rounded-full p-2 ${notification.read ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={notification.href} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                    {title}: {notification.label}
                  </Link>
                  <p className="mt-1 break-words text-sm text-slate-600">{message}</p>
                  <time className="mt-2 block text-xs text-slate-500" dateTime={notification.timestamp}>{formattedDate}</time>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busyId)}
                  aria-label={getNotificationCenterText(locale, notification.read ? 'markUnread' : 'markRead')}
                  title={getNotificationCenterText(locale, notification.read ? 'markUnread' : 'markRead')}
                  onClick={() => void updateReadState(notification.read ? 'unread' : 'read', notification.id)}
                >
                  {getNotificationCenterText(locale, notification.read ? 'markUnread' : 'markRead')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {actionError && <p role="alert" className="mt-3 text-sm text-rose-700">{getNotificationCenterText(locale, 'actionError')}</p>}
    </PageContainer>
  )
}
