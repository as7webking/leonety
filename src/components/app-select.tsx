'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface AppSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface AppSelectProps {
  value: string
  options: AppSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export function AppSelect({ value, options, onChange, disabled, ariaLabel, className = '' }: AppSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selected?.label ?? options[0]?.label ?? ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => {
                if (option.disabled) return
                onChange(option.value)
                setOpen(false)
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                option.value === value
                  ? 'bg-slate-100 text-slate-950'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
