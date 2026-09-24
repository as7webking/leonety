'use client'

import Link from 'next/link'
import { Cloud, WifiOff } from 'lucide-react'
import { useOfflineMode } from '@/contexts/offline-mode-context'
import { useI18n } from '@/contexts/i18n-context'

const draftRoutes = {
  contract: '/app/contracts/new',
  expense: '/app/expenses',
  income: '/app/income',
} as const

export function OfflineStatusBar() {
  const { isOnline, draftKinds, connectionRestored, storageUnavailable } = useOfflineMode()
  const { t } = useI18n()

  if (isOnline && !connectionRestored && !storageUnavailable) return null

  const firstDraft = draftKinds[0]
  return (
    <div className="no-print px-4 pt-3 sm:px-6 lg:px-8">
      <div className={`mx-auto flex max-w-7xl flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
        {isOnline ? <Cloud className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
        <span className="font-semibold">{isOnline ? t('offline.connectionRestored') : t('offline.status')}</span>
        <span>{storageUnavailable ? t('offline.storageUnavailable') : isOnline ? (draftKinds.length > 0 ? t('offline.localDraftCount').replace('{count}', String(draftKinds.length)) : '') : t('offline.staleData')}</span>
        {isOnline && firstDraft && (
          <Link href={draftRoutes[firstDraft]} className="ml-auto font-semibold underline underline-offset-2">
            {t('offline.reviewDraft')}
          </Link>
        )}
      </div>
    </div>
  )
}
