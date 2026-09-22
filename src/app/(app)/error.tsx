'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/components'
import { useI18n } from '@/contexts/i18n-context'

export default function AuthenticatedAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    console.error('Authenticated page render failed', {
      digest: error.digest,
      name: error.name,
    })
  }, [error])

  return (
    <PageContainer>
      <Card className="max-w-xl border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900">{t('common.error')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-red-800">{t('common.authenticatedPageError')}</p>
          <Button type="button" onClick={reset}>{t('common.tryAgain')}</Button>
        </CardContent>
      </Card>
    </PageContainer>
  )
}
