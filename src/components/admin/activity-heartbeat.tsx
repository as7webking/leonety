'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const CLIENT_REQUEST_INTERVAL_MS = 60_000
const CHANNEL_NAME = 'leonety-activity-heartbeat'

export function ActivityHeartbeat() {
  const pathname = usePathname()

  useEffect(() => {
    let lastRequestAt = 0
    let trailingTimer: ReturnType<typeof setTimeout> | undefined
    const channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(CHANNEL_NAME)
      : null

    channel?.addEventListener('message', (event: MessageEvent<unknown>) => {
      const value = event.data as { type?: unknown; at?: unknown } | null
      if (value?.type === 'sent' && typeof value.at === 'number') {
        lastRequestAt = Math.max(lastRequestAt, value.at)
      }
    })

    const send = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      const wait = CLIENT_REQUEST_INTERVAL_MS - (now - lastRequestAt)
      if (wait > 0) {
        if (!trailingTimer) {
          trailingTimer = setTimeout(() => {
            trailingTimer = undefined
            send()
          }, wait)
        }
        return
      }

      lastRequestAt = now
      channel?.postMessage({ type: 'sent', at: now })
      void fetch('/api/activity/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => {
        // Activity tracking is best-effort and must never interrupt app use.
      })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') send()
    }
    const onInteraction = () => send()

    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerdown', onInteraction, { passive: true })
    document.addEventListener('keydown', onInteraction)
    document.addEventListener('touchstart', onInteraction, { passive: true })
    send()

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerdown', onInteraction)
      document.removeEventListener('keydown', onInteraction)
      document.removeEventListener('touchstart', onInteraction)
      if (trailingTimer) clearTimeout(trailingTimer)
      channel?.close()
    }
  }, [pathname])

  return null
}
