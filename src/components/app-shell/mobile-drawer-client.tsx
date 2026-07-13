'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu, Search, X } from 'lucide-react'
import { AppSearch } from '@/components/app-search'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ProfileMenuClient } from '@/components/app-shell/profile-menu-client'
import { WorkspaceSelectorClient } from '@/components/app-shell/workspace-selector-client'
import { navigationGroups, primaryNavigation } from '@/components/app-shell/navigation-items'

export function MobileDrawerClient() {
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousTouchAction = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.touchAction = previousTouchAction
    }
  }, [open])

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
        <Link href="/app/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <img src="/icon-192.png" alt="Leonety" className="h-9 w-9 object-contain" />
          <span className="sr-only">Leonety</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
            onClick={() => setSearchOpen((value) => !value)}
            aria-label="Toggle search"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-700"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="fixed inset-x-0 top-16 z-40 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <AppSearch />
        </div>
      )}

      <div className={`fixed inset-0 z-[70] md:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-950/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-dvh w-[min(20rem,88vw)] overflow-y-auto bg-white shadow-2xl transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
          aria-label="Mobile app navigation"
        >
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <Link href="/app/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <img src="/icon-192.png" alt="Leonety" className="h-9 w-9 object-contain" />
              <span className="font-semibold text-slate-950">Leonety</span>
            </Link>
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 p-4">
            <WorkspaceSelectorClient />
            <nav className="space-y-1" aria-label="Primary navigation">
              {primaryNavigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {navigationGroups.map((group) => (
              <section key={group.label} className="space-y-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </section>
            ))}

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <LanguageSwitcher />
              <ProfileMenuClient />
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
