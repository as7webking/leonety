"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { useI18n } from "@/contexts/i18n-context"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"

interface LoadingSkeletonProps {
  className?: string
}

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  const { t } = useI18n()

  return (
    <div className={cn("flex min-h-56 flex-col items-center justify-center gap-5 rounded-lg border border-slate-200 bg-white p-8", className)}>
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
        <Logo size="md" />
      </div>
      <div className="text-center">
        <p className="font-medium text-slate-900">{t('common.loading')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('common.loadingDescription')}</p>
      </div>
      <div className="w-full max-w-md space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </div>
  )
}
