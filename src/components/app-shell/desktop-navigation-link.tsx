'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { T } from '@/components/t'
import { isNavigationItemActive, type NavigationItem } from '@/components/app-shell/navigation-items'

export function DesktopNavigationLink({ item }: { item: NavigationItem }) {
  const pathname = usePathname()
  const active = isNavigationItemActive(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span><T k={item.labelKey} /></span>
    </Link>
  )
}
