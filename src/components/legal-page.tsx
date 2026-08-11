'use client'

import Link from 'next/link'
import { PublicHeader } from '@/components/public-header'
import { useI18n } from '@/contexts/i18n-context'

type LegalSection = {
  title?: string
  titleKey?: string
  content?: React.ReactNode
  contentKey?: string
}

interface LegalPageProps {
  title?: string
  titleKey?: string
  intro?: React.ReactNode
  introKey?: string
  sections: LegalSection[]
}

export function LegalPage({ title, titleKey, intro, introKey, sections }: LegalPageProps) {
  const { t } = useI18n()
  const resolvedTitle = titleKey ? t(titleKey) : title

  return (
    <>
      <PublicHeader />
      <main className="bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
          <div className="mb-8">
            <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-950">
              {t('legal.back')}
            </Link>
          </div>

          <article className="space-y-8">
            <header className="space-y-3">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t('legal.label')}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{resolvedTitle}</h1>
              {(intro || introKey) && <div className="text-base leading-7 text-slate-600">{introKey ? t(introKey) : intro}</div>}
            </header>

            <div className="space-y-8">
              {sections.map((section) => (
                <section key={section.titleKey ?? section.title} className="space-y-3">
                  <h2 className="text-xl font-semibold text-slate-950">{section.titleKey ? t(section.titleKey) : section.title}</h2>
                  <div className="space-y-3 text-sm leading-7 text-slate-600">{section.contentKey ? <p>{t(section.contentKey)}</p> : section.content}</div>
                </section>
              ))}
            </div>

            <footer className="border-t border-slate-200 pt-6 text-sm text-slate-500">
              {t('legal.updated')}
            </footer>
          </article>
        </div>
      </main>
    </>
  )
}
