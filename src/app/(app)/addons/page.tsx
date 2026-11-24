'use client'

import { PageContainer, PageHeader } from '@/components'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { builtInAddonRegistry } from '@/lib/addons/registry'

export default function AddonsPage() {
  const { currentCompany, loading } = useCompany()
  const { t } = useI18n()

  return (
    <PageContainer>
      <PageHeader title={t('addons.catalog.title')} description={t('addons.catalog.description')} />
      {!loading && !currentCompany && (
        <p className="mb-5 rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-600">
          {t('addons.noWorkspace')}
        </p>
      )}
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {builtInAddonRegistry.map((addon) => (
          <section key={addon.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-950">{t(addon.titleKey)}</h2>
              <p className="mt-1 text-sm text-slate-600">{t(addon.descriptionKey)}</p>
              <p className="mt-3 text-sm text-slate-600">{t('addons.activationUnavailable')}</p>
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              {t('addons.status.planned')}
            </span>
          </section>
        ))}
      </div>
    </PageContainer>
  )
}
