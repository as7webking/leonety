'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'

const CONSENT_KEY = 'leonety-cookie-consent'

export function CookieNotice() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(window.localStorage.getItem(CONSENT_KEY) !== 'accepted')
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const accept = () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-lg backdrop-blur">
      <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t('cookieNotice.text')} <Link href="/cookies" className="font-medium text-slate-900 underline">{t('legal.cookies.title')}</Link>.
        </p>
        <Button type="button" size="sm" onClick={accept}>
          {t('cookieNotice.accept')}
        </Button>
      </div>
    </div>
  )
}
