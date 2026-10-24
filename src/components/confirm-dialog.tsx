'use client'

import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { trapFocusWithin } from '@/lib/dialog-focus'
import { useEffect, useId, useRef, useState } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useBodyScrollLock(open)
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const confirmingRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    cancelButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmingRef.current) return
        event.preventDefault()
        onCancelRef.current()
      } else if (event.key === 'Tab' && dialogRef.current) {
        trapFocusWithin(dialogRef.current, event)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  async function handleConfirm() {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-[max(1rem,env(safe-area-inset-top))] sm:py-12">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">{title}</h2>
        {description && <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">{description}</p>}
        <div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row">
          <Button ref={cancelButtonRef} type="button" variant="outline" disabled={confirming} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} disabled={confirming} onClick={() => void handleConfirm()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
