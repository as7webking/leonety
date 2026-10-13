'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createIncomingOrderPushPayload, type IncomingOrderPushPayload } from '@/lib/order-notifications'

type EventRow = { id:string; provider:'woocommerce'; external_order_id:string; order_number:string|null; amount:string|null; currency:string|null; acknowledgement_status:'new'|'notified'|'seen'|'acknowledged' }

function playDefaultChime(volume = 0.7) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.frequency.setValueAtTime(880, context.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.35)
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.18 * volume), context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.52)
  oscillator.addEventListener('ended', () => void context.close())
  return () => { try { oscillator.stop() } catch { /* Already stopped. */ }; void context.close() }
}

export function IncomingOrderAlert() {
  const { currentCompanyId } = useCompany()
  const { locale, t } = useI18n()
  const [alert, setAlert] = useState<IncomingOrderPushPayload | null>(null)
  const [ackError, setAckError] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const activeEventIdRef = useRef('')

  const stopSound = useCallback(() => { stopRef.current?.(); stopRef.current = null }, [])
  const receive = useCallback((payload: IncomingOrderPushPayload) => {
    if (!payload || payload.type !== 'incoming-order' || payload.companyId !== currentCompanyId) return
    if (payload.test && activeEventIdRef.current && activeEventIdRef.current !== 'test') return
    if (activeEventIdRef.current === payload.eventId) return
    activeEventIdRef.current = payload.eventId
    stopSound()
    setAckError(false)
    setAlert(payload)
    void (async () => {
      try {
        const response = await fetch(`/api/order-notifications/sound?companyId=${encodeURIComponent(payload.companyId)}`, { cache:'no-store' })
        const sound = await response.json().catch(() => ({}))
        if (!response.ok || sound.enabled === false) return
        const volume = Math.min(1, Math.max(0, Number(sound.volume ?? 0.7)))
        if (sound.url) {
          const audio = new Audio(sound.url)
          audio.loop = true
          audio.volume = volume
          stopRef.current = () => { audio.pause(); audio.currentTime = 0 }
          await audio.play()
        } else {
          const first = playDefaultChime(volume)
          const timer = window.setInterval(() => { void playDefaultChime(volume) }, 5500)
          stopRef.current = () => { first?.(); window.clearInterval(timer) }
        }
      } catch {
        // Autoplay restrictions are expected; the visible alert remains available.
      }
    })()
  }, [currentCompanyId, stopSound])

  useEffect(() => {
    if (!currentCompanyId) return
    const loadUnacknowledged = async () => {
      const eventId = activeEventIdRef.current
      const params = new URLSearchParams({ companyId:currentCompanyId })
      if (eventId && eventId !== 'test') params.set('eventId', eventId)
      const response = await fetch(`/api/order-notifications/events?${params.toString()}`, { cache:'no-store' })
      const payload = await response.json().catch(() => ({}))
      const event = (payload.events as EventRow[] | undefined)?.find((item) => item.acknowledgement_status !== 'acknowledged')
      if (!response.ok) return
      if (eventId && eventId !== 'test' && payload.activeAcknowledged) {
        activeEventIdRef.current = ''; stopSound(); setAlert(null); return
      }
      if ((!activeEventIdRef.current || activeEventIdRef.current === 'test') && event && event.acknowledgement_status !== 'acknowledged') {
        receive(createIncomingOrderPushPayload({ eventId:event.id, locale, companyId:currentCompanyId, orderId:event.external_order_id, orderNumber:event.order_number || event.external_order_id, amount:event.amount || '', currency:event.currency || '' }))
      }
    }
    void loadUnacknowledged()
    const poll = window.setInterval(() => void loadUnacknowledged(), 15_000)
    if (!('serviceWorker' in navigator)) return
    const handleMessage = (event: MessageEvent<IncomingOrderPushPayload>) => receive(event.data)
    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => { window.clearInterval(poll); navigator.serviceWorker.removeEventListener('message', handleMessage); stopSound() }
  }, [currentCompanyId, locale, receive, stopSound])

  const acknowledge = async () => {
    if (!alert) return
    if (alert.test) { activeEventIdRef.current = ''; stopSound(); setAlert(null); window.dispatchEvent(new Event('leonety-order-test-acknowledged')); return }
    const response = await fetch('/api/order-notifications/events', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId:alert.companyId, eventId:alert.eventId, action:'acknowledge' }) })
    if (!response.ok) { setAckError(true); return }
    activeEventIdRef.current = ''; stopSound(); setAlert(null); setAckError(false)
  }

  const viewOrder = async () => {
    if (alert && !alert.test) await fetch('/api/order-notifications/events', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ companyId:alert.companyId, eventId:alert.eventId, action:'seen' }) })
  }

  if (!alert) return null
  return (
    <aside className="no-print fixed left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] top-[calc(1rem+env(safe-area-inset-top))] z-[75] ml-auto max-w-sm rounded-lg border border-amber-300 bg-white p-4 shadow-xl" role="alert" aria-live="assertive">
      <div className="flex items-start gap-3"><span className="rounded-md bg-amber-100 p-2 text-amber-700"><BellRing className="h-5 w-5" /></span><div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase text-amber-700">{alert.test ? t('orderNotifications.test') : t('orderNotifications.newOrder')}</p>
        <p className="mt-1 font-semibold text-slate-950">WooCommerce · #{alert.orderNumber}</p>
        {alert.amount && <p className="mt-1 text-sm text-slate-600">{alert.amount} {alert.currency}</p>}
      </div></div>
      {ackError && <p className="mt-2 text-sm text-red-700">{t('orderNotifications.acknowledgeFailed')}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={()=>void acknowledge()}><Check className="h-4 w-4" />{t('orderNotifications.acknowledge')}</Button>
        <Link href={alert.url} onClick={()=>void viewOrder()}><Button type="button" size="sm" variant="outline">{t('orderNotifications.openIntegration')}</Button></Link>
      </div>
    </aside>
  )
}
