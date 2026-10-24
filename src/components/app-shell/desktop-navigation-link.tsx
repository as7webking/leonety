'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { T } from '@/components/t'

interface DesktopNavigationLinkProps {
  href: string
  activeHref?: string
  labelKey: string
  icon: ReactNode
}

export function DesktopNavigationLink({ href, activeHref, labelKey, icon }: DesktopNavigationLinkProps) {
  const active = activeHref === href

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
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
