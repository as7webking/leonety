'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  placement?: 'bottom' | 'top'
}

export function AppSelect({ value, options, onChange, disabled, ariaLabel, className = '', placement = 'bottom' }: AppSelectProps) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value)

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 12
    const offset = 6
    const availableBelow = viewportHeight - rect.bottom - padding
    const availableAbove = rect.top - padding
    const preferredTop = placement === 'top'
    const openAbove = preferredTop
      ? availableAbove >= 160 || availableAbove > availableBelow
      : availableBelow < 220 && availableAbove > availableBelow
    const availableHeight = Math.max(120, openAbove ? availableAbove - offset : availableBelow - offset)
    const width = Math.min(rect.width, viewportWidth - padding * 2)
    const left = Math.min(Math.max(padding, rect.left), viewportWidth - width - padding)
    const top = openAbove
      ? Math.max(padding, rect.top - offset - Math.min(288, availableHeight))
      : Math.min(viewportHeight - padding, rect.bottom + offset)

    setMenuStyle({
      position: 'fixed',
      left,
      top,
      width,
      maxHeight: Math.min(288, availableHeight),
      zIndex: 140,
    })
  }, [placement])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
  }, [open, updateMenuPosition, options.length])

  const menu = open && menuStyle && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      role="listbox"
      style={menuStyle}
      className="overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
    >
      {options.map((option, index) => (
        <button
          key={`${option.value}-${option.label}-${index}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
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
    </div>,
    document.body
  ) : null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selected?.label ?? options[0]?.label ?? ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  )
}
