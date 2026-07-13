'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useI18n } from '@/contexts/i18n-context'

export function ProfileMenuClient() {
  const router = useRouter()
  const { t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? '')
    })
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const initials = (email || 'U').slice(0, 1).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">{email || t('nav.profile')}</span>
          <span className="block truncate text-xs text-slate-500">{t('nav.profile')}</span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <Link href="/app/profile" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
            <UserRound className="h-4 w-4" />
            {t('nav.profile')}
          </Link>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={async () => {
              await supabase.auth.signOut()
              setOpen(false)
              router.push('/login')
            }}
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
