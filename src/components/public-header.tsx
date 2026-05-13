'use client'

import Link from "next/link"
import { DollarSign } from "lucide-react"

interface PublicHeaderProps {
  user?: { id: string } | null
}

export function PublicHeader({ user }: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <DollarSign className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Leonety</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <Link href="/#product" className="transition hover:text-slate-900">Product</Link>
          <Link href="/#features" className="transition hover:text-slate-900">Features</Link>
          <Link href="/#pricing" className="transition hover:text-slate-900">Pricing</Link>
          <Link href="/#workflows" className="transition hover:text-slate-900">Workflows</Link>
          <Link href="/#support" className="transition hover:text-slate-900">Support</Link>
          <Link href="/#help-center" className="transition hover:text-slate-900">Help Center</Link>
          <Link href="/privacy" className="transition hover:text-slate-900">Privacy</Link>
          <Link href="/terms" className="transition hover:text-slate-900">Terms</Link>
        </nav>

        <Link href={user ? '/profile' : '/login'} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
          Profile
        </Link>
      </div>
    </header>
  )
}
