'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'

interface IncomeBulkTitleDialogProps {
  labels: {
    title: string
    warning: string
    changeTitle: string
    titleLabel: string
    titlePlaceholder: string
    titleRequired: string
    cancel: string
    update: string
  }
  submitting: boolean
  onCancel: () => void
  onSubmit: (title: string) => void
}

export function IncomeBulkTitleDialog({
  labels,
  submitting,
  onCancel,
  onSubmit,
}: IncomeBulkTitleDialogProps) {
  const titleId = useId()
  const changeTitleRef = useRef<HTMLInputElement>(null)
  const [changeTitle, setChangeTitle] = useState(false)
  const [title, setTitle] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  useBodyScrollLock(true)

  useEffect(() => {
    changeTitleRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, submitting])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!changeTitle || !title.trim()) {
      setValidationMessage(labels.titleRequired)
      return
    }
    setValidationMessage('')
    onSubmit(title.trim())
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-hidden bg-slate-950/40 px-3 py-[max(1rem,env(safe-area-inset-top))] sm:px-4 sm:py-12">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-4 shadow-xl sm:max-h-[calc(100dvh-6rem)] sm:p-6"
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">{labels.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{labels.warning}</p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 p-3 text-sm font-medium">
            <input
              ref={changeTitleRef}
              type="checkbox"
              checked={changeTitle}
              onChange={(event) => {
                setChangeTitle(event.target.checked)
                setValidationMessage('')
              }}
              className="h-4 w-4 shrink-0"
            />
            {labels.changeTitle}
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">{labels.titleLabel}</span>
            <input
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                setValidationMessage('')
              }}
              disabled={!changeTitle || submitting}
              maxLength={160}
              className="w-full rounded-md border border-slate-200 px-3 py-2 disabled:bg-slate-100"
              placeholder={labels.titlePlaceholder}
            />
          </label>

          {validationMessage && <p className="text-sm text-red-700" role="alert">{validationMessage}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>{labels.cancel}</Button>
            <Button type="submit" disabled={submitting || !changeTitle || !title.trim()}>{labels.update}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
