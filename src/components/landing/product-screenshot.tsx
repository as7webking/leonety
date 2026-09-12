'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Expand, X } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'

interface ProductScreenshotProps {
  src: string
  altKey: string
  width: number
  height: number
  priority?: boolean
  portrait?: boolean
}

export function ProductScreenshot({ src, altKey, width, height, priority = false, portrait = false }: ProductScreenshotProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`group relative block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left shadow-xl shadow-slate-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${portrait ? 'mx-auto max-w-sm' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`${t('landing.media.enlarge')}: ${t(altKey)}`}
      >
        <Image
          src={src}
          alt={t(altKey)}
          width={width}
          height={height}
          priority={priority}
          sizes={portrait ? '(max-width: 768px) 92vw, 420px' : '(max-width: 1024px) 92vw, 640px'}
          className="h-auto w-full"
        />
        <span className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-slate-950/80 text-white opacity-100 backdrop-blur transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
          <Expand className="h-5 w-5" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/90 p-3 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t(altKey)}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false)
          }}
        >
          <div className="relative my-auto w-full max-w-7xl">
            <button
              ref={closeButtonRef}
              type="button"
              className="absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-md bg-white text-slate-950 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setOpen(false)}
              aria-label={t('landing.media.close')}
            >
              <X className="h-5 w-5" />
            </button>
            <Image src={src} alt={t(altKey)} width={width} height={height} sizes="96vw" className="h-auto max-h-[calc(100dvh-2rem)] w-full rounded-lg object-contain" />
          </div>
        </div>
      )}
    </>
  )
}
