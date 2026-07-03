'use client'

import { useState } from 'react'
import { LifeBuoy, X } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'

export function SupportWidget() {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div className="mb-3 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">{t('support.title')}</p>
              <p className="text-sm text-slate-600">{t('support.description')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 text-sm text-slate-700">
            <p>{t('support.botPlaceholder')}</p>
            <a className="font-medium text-blue-700 hover:underline" href="mailto:admin@ahmedsultanline.com">
              admin@ahmedsultanline.com
            </a>
          </div>
        </div>
      )}
      <Button type="button" onClick={() => setOpen((current) => !current)} className="shadow-lg">
        <LifeBuoy className="h-4 w-4" />
        {t('support.button')}
      </Button>
    </div>
  )
}
