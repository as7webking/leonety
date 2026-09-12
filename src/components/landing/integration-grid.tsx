'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'

export type LandingIntegration = readonly [name: string, statusKey: string, className: string]

export function IntegrationGrid({ initial, more }: { initial: readonly LandingIntegration[]; more: readonly LandingIntegration[] }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  const renderCard = ([name, statusKey, className]: LandingIntegration) => (
    <article key={name} className="rounded-lg border border-white/15 bg-white/[0.06] p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 font-semibold">{name}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}>{t(statusKey)}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">{t('landing.integrations.cardText')}</p>
    </article>
  )

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">{initial.map(renderCard)}</div>
      {expanded && <div className="mt-3 grid gap-3 sm:grid-cols-2">{more.map(renderCard)}</div>}
      <button
        type="button"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/25 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {t(expanded ? 'landing.integrations.viewLess' : 'landing.integrations.viewMore')}
        <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}
