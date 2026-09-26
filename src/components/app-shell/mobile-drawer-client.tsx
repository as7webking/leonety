'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Search, X } from 'lucide-react'
import { AppSearch } from '@/components/app-search'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Logo } from '@/components/logo'
import { ProfileMenuClient } from '@/components/app-shell/profile-menu-client'
import { WorkspaceSelectorClient } from '@/components/app-shell/workspace-selector-client'
import { getNavigationForMode } from '@/components/app-shell/navigation-items'
import { useI18n } from '@/contexts/i18n-context'
import { useCompany } from '@/contexts/company-context'
import { normalizeAppMode } from '@/lib/app-mode'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import {
  shouldCloseNavigationDrawer,
  type NavigationSwipe,
} from '@/lib/mobile-navigation-gesture'

export function MobileDrawerClient() {
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()
  const { t } = useI18n()
  const { currentCompany } = useCompany()
  const navigation = getNavigationForMode(normalizeAppMode(currentCompany?.type))
  const gestureRef = useRef<Pick<NavigationSwipe, 'startX' | 'startY'> | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  useBodyScrollLock(open)

  const openDrawer = useCallback(() => {
    setSearchOpen(false)
    setOpen(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setOpen(false)
  }, [])

  const beginGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse') return
    gestureRef.current = { startX: event.clientX, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const finishCloseGesture = (event: React.PointerEvent<HTMLElement>) => {
    const start = gestureRef.current
    gestureRef.current = null
    if (!start) return
    const swipe = { ...start, endX: event.clientX, endY: event.clientY }
    if (shouldCloseNavigationDrawer(swipe)) closeDrawer()
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOpen(false)
      setSearchOpen(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1280px)')
    const handleDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setOpen(false)
        setSearchOpen(false)
      }
    }
    desktop.addEventListener('change', handleDesktop)
    return () => desktop.removeEventListener('change', handleDesktop)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [closeDrawer, open])

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-slate-200 bg-white/95 pb-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur xl:hidden">
        <Link href="/app/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Logo size="md" className="h-9 w-9" />
          <span className="sr-only">Leonety</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
            onClick={() => setSearchOpen((value) => !value)}
            aria-label={t('search.label')}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700"
            onClick={openDrawer}
            aria-label={t('nav.openMenu')}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 max-w-full border-b border-slate-200 bg-white py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] xl:hidden">
          <AppSearch />
        </div>
      )}

      {open && <div className="fixed inset-0 z-[70] max-w-full overflow-hidden xl:hidden">
        <div
          className="absolute inset-0 bg-slate-950/40"
          onClick={closeDrawer}
        />
        <aside
          className="absolute left-0 top-0 h-dvh w-[calc(100%-0.75rem)] max-w-80 touch-pan-y overflow-y-auto overscroll-contain bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
          aria-labelledby="mobile-app-navigation-label"
          aria-modal="true"
          role="dialog"
          onPointerDown={beginGesture}
          onPointerUp={finishCloseGesture}
          onPointerCancel={() => { gestureRef.current = null }}
        >
          <span id="mobile-app-navigation-label" className="sr-only">{t('nav.mobileAppNavigation')}</span>
          <div className="flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-slate-200 pb-0 pl-[max(1rem,env(safe-area-inset-left))] pr-4 pt-[env(safe-area-inset-top)]">
            <Link href="/app/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <Logo size="md" className="h-9 w-9" />
              <span className="font-semibold text-slate-950">Leonety</span>
            </Link>
            <button ref={closeButtonRef} type="button" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" onClick={closeDrawer} aria-label={t('nav.closeMenu')}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 pb-4 pl-[max(1rem,env(safe-area-inset-left))] pr-4 pt-4">
            <WorkspaceSelectorClient />
            <nav className="space-y-1" aria-labelledby="mobile-primary-navigation-label">
              <span id="mobile-primary-navigation-label" className="sr-only">{t('nav.primaryNavigation')}</span>
              {navigation.primary.map((item) => {
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
                    <Icon className="h-4 w-4" />
                    {t(item.labelKey)}
                  </Link>
                )
              })}
            </nav>

            {navigation.groups.map((group) => (
              <section key={group.labelKey} className="space-y-1">
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t(group.labelKey)}</p>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">
                      <Icon className="h-4 w-4" />
                      {t(item.labelKey)}
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
      </div>}
    </>
  )
}
