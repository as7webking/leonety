'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import type { IncomingOrderPushPayload } from '@/lib/order-notifications'

function playDefaultChime() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.setValueAtTime(880, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.35)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.52)
  oscillator.addEventListener('ended', () => void context.close())
  return () => {
    try { oscillator.stop() } catch { /* It may already have stopped naturally. */ }
    void context.close()
  }
}

export function IncomingOrderAlert() {
  const { currentCompanyId } = useCompany()
  const { t } = useI18n()
  const [alert, setAlert] = useState<IncomingOrderPushPayload | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handleMessage = async (event: MessageEvent<IncomingOrderPushPayload>) => {
      const payload = event.data
      if (!payload || payload.type !== 'incoming-order' || payload.companyId !== currentCompanyId) return
      stopRef.current?.()
      setAlert(payload)

      try {
        const response = await fetch(`/api/order-notifications/sound?companyId=${encodeURIComponent(payload.companyId)}`, { cache: 'no-store' })
        const sound = await response.json().catch(() => ({}))
        if (response.ok && sound.enabled === false) {
          stopRef.current = null
        } else if (response.ok && sound.url) {
          const audio = new Audio(sound.url)
          stopRef.current = () => { audio.pause(); audio.currentTime = 0 }
          await audio.play()
        } else {
          stopRef.current = playDefaultChime()
        }
      } catch {
        stopRef.current = playDefaultChime()
      }
    }
    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage)
      stopRef.current?.()
    }
  }, [currentCompanyId])

  if (!alert) return null
  const acknowledge = () => { stopRef.current?.(); stopRef.current = null; setAlert(null) }

  return (
    <aside className="no-print fixed right-4 top-[calc(1rem+env(safe-area-inset-top))] z-[75] w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-amber-300 bg-white p-4 shadow-xl" role="alert" aria-live="assertive">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-amber-100 p-2 text-amber-700"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-amber-700">{t('orderNotifications.newOrder')}</p>
          <p className="mt-1 font-semibold text-slate-950">WooCommerce · #{alert.orderNumber}</p>
          {alert.amount && <p className="mt-1 text-sm text-slate-600">{alert.amount} {alert.currency}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={acknowledge}><Check className="h-4 w-4" />{t('orderNotifications.acknowledge')}</Button>
        <Link href={alert.url} onClick={acknowledge}><Button type="button" size="sm" variant="outline">{t('orderNotifications.openIntegration')}</Button></Link>
      </div>
    </aside>
  )
}
