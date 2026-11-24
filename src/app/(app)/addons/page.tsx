'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PageContainer, PageHeader } from '@/components'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useWorkspaceAddons } from '@/contexts/workspace-addon-context'
import { builtInAddonRegistry } from '@/lib/addons/registry'
import { ConfirmDialog } from '@/components/confirm-dialog'

type AddonId = (typeof builtInAddonRegistry)[number]['id']

export default function AddonsPage() {
  const { currentCompany, currentCompanyId, loading } = useCompany()
  const { t } = useI18n()
  const { activations, loading: activationLoading, error, saveError, refresh, setEnabled } = useWorkspaceAddons()
  const [pendingAddonId, setPendingAddonId] = useState<string | null>(null)
  const [deactivationTarget, setDeactivationTarget] = useState<AddonId | null>(null)

  useEffect(() => {
    setDeactivationTarget(null)
    setPendingAddonId(null)
  }, [currentCompanyId])

  const targetAddon = builtInAddonRegistry.find((addon) => addon.id === deactivationTarget)
  const targetActivation = activations.find((activation) => activation.addonId === deactivationTarget)

  async function handleActivation(addonId: AddonId, enabled: boolean) {
    setPendingAddonId(addonId)
    try {
      await setEnabled(addonId, enabled)
      if (!enabled) setDeactivationTarget(null)
    } catch {
      // The provider exposes the safe localized failure state.
    } finally {
      setPendingAddonId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t('addons.catalog.title')} description={t('addons.catalog.description')} />
      {!loading && !currentCompany && (
        <p className="mb-5 rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-600">
          {t('addons.noWorkspace')}
        </p>
      )}
      {currentCompany && activationLoading && (
        <p className="mb-5 text-sm text-slate-600" role="status">{t('addons.loading')}</p>
      )}
      {currentCompany && error && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          <span>{t('addons.loadFailed')}</span>
          <button type="button" className="min-h-10 rounded-md border border-rose-300 px-3 font-medium hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700" onClick={() => void refresh()}>
            {t('addons.retry')}
          </button>
        </div>
      )}
      {builtInAddonRegistry.length === 0 && !loading && (
        <p className="rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-600" role="status">
          {t('addons.catalog.empty')}
        </p>
      )}
      <div className="divide-y divide-slate-200 border-y border-slate-200">
        {builtInAddonRegistry.map((addon) => (
          <section key={addon.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-950">{t(addon.titleKey)}</h2>
              <p className="mt-1 text-sm text-slate-600">{t(addon.descriptionKey)}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">{t(`addons.category.${addon.category}`)}</p>
              {currentCompany && !loading && !activationLoading && !error && (() => {
                const activation = activations.find((item) => item.addonId === addon.id)
                if (!activation) return null
                const pending = pendingAddonId === addon.id
                const canToggle = activation.canManage && (activation.canEnable || activation.enabled)
                return (
                  <>
                    <p className="mt-3 text-sm text-slate-600">
                      {activation.available
                        ? activation.enabled ? t('addons.status.enabled') : t('addons.status.disabled')
                        : t('addons.status.planned')}
                      {!activation.available && activation.enabled ? ` · ${t('addons.enabledButUnavailable')}` : ''}
                    </p>
                    {saveError && <p className="mt-2 text-sm text-rose-700" role="alert">{t('addons.saveFailed')}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canToggle && (
                        <button
                          type="button"
                          disabled={pending}
                          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-wait disabled:opacity-60"
                          onClick={() => activation.enabled
                            ? setDeactivationTarget(addon.id)
                            : void handleActivation(addon.id, true)}
                        >
                          {pending ? t('addons.saving') : activation.enabled ? t('addons.deactivate') : t('addons.activate')}
                        </button>
                      )}
                      {activation.canOpen && addon.route && (
                        <Link href={addon.route} className="inline-flex min-h-10 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">
                          {t('addons.open')}
                        </Link>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
            <span className="inline-flex w-fit shrink-0 items-center rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
              {activationLoading || error ? t('addons.status.unknown') : t(activations.find((item) => item.addonId === addon.id)?.available ? 'addons.status.available' : 'addons.status.planned')}
            </span>
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(targetAddon && targetActivation?.enabled && targetActivation.canManage)}
        title={t('addons.deactivateConfirm.title')}
        description={targetAddon ? t('addons.deactivateConfirm.description') : ''}
        errorMessage={saveError ? t('addons.saveFailed') : undefined}
        confirmLabel={t('addons.deactivate')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setDeactivationTarget(null)}
        onConfirm={() => targetAddon ? handleActivation(targetAddon.id, false) : undefined}
      />
    </PageContainer>
  )
}
