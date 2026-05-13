'use client'

import { useEffect } from 'react'

export function PwaInstaller() {
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
    }

    const handleAppInstalled = () => {
      console.log('PWA was installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  return null
}
