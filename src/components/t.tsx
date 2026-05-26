'use client'

import { useI18n } from '@/contexts/i18n-context'

export function T({ k }: { k: string }) {
  const { t } = useI18n()
  return <>{t(k)}</>
}
