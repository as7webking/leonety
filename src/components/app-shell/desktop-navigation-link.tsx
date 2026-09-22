'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { T } from '@/components/t'
import { isNavigationItemActive } from '@/components/app-shell/navigation-items'

interface DesktopNavigationLinkProps {
  href: string
  labelKey: string
  icon: ReactNode
}

export function DesktopNavigationLink({ href, labelKey, icon }: DesktopNavigationLinkProps) {
  const pathname = usePathname()
  const active = isNavigationItemActive(pathname, href)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
      }`}
    >
      {icon}
      <span><T k={labelKey} /></span>
    </Link>
  )
}
