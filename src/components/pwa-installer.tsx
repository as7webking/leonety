'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISSED_KEY = 'leonety-install-dismissed'

function isStandalone() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)
}

export function PwaInstaller() {
  const { t } = useI18n()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem(DISMISSED_KEY) === 'true'
  ))
  const [installed, setInstalled] = useState(() => isStandalone())

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isDevelopment = process.env.NODE_ENV === 'development'

    const unregisterExistingWorkers = async () => {
      if (!('serviceWorker' in navigator)) return

      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    if (isDevelopment) {
      unregisterExistingWorkers().catch((error) => {
        console.log('Service Worker cleanup failed:', error)
      })
    } else if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('Service Worker registered:', registration)
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error)
        })
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      window.localStorage.setItem(DISMISSED_KEY, 'true')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') {
      setInstallPrompt(null)
      setDismissed(true)
      window.localStorage.setItem(DISMISSED_KEY, 'true')
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    window.localStorage.setItem(DISMISSED_KEY, 'true')
  }

  if (installed || dismissed || (!installPrompt && !isIos)) {
    return null
  }

  return (
    <div className="no-print fixed bottom-4 left-4 right-4 z-[70] mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-lg md:left-auto md:right-4">
      <p className="font-medium text-slate-950">{t('pwa.installTitle')}</p>
      <p className="mt-1 text-sm text-slate-600">
        {isIos && !installPrompt ? t('pwa.iosInstructions') : t('pwa.installDescription')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {installPrompt && (
          <Button type="button" size="sm" onClick={() => void handleInstall()}>
            {t('pwa.installButton')}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={handleDismiss}>
          {t('common.dismiss')}
        </Button>
      </div>
    </div>
  )
}
