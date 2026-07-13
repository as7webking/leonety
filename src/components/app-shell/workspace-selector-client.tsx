'use client'

import { useRouter } from 'next/navigation'
import { AppSelect } from '@/components/app-select'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

const WORKSPACE_ACTION_VALUE = '__workspace_action__'

export function WorkspaceSelectorClient() {
  const router = useRouter()
  const { companies, currentCompanyId, loading, setCurrentCompanyId } = useCompany()
  const { t } = useI18n()
  const options = [
    ...(companies.length === 0 ? [{ value: '', label: t('nav.noWorkspace'), disabled: true }] : []),
    ...companies.map((company) => ({
      value: company.id,
      label: `${company.name} (${company.type})`,
    })),
    { value: WORKSPACE_ACTION_VALUE, label: t('nav.addWorkspace') },
  ]

  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
      <AppSelect
        value={currentCompanyId ?? ''}
        onChange={(value) => {
          if (value === WORKSPACE_ACTION_VALUE) {
            router.push('/app/workspaces')
            return
          }
          if (value) setCurrentCompanyId(value)
        }}
        disabled={loading}
        options={options}
        ariaLabel="Current workspace"
        className="w-full"
      />
    </div>
  )
}
