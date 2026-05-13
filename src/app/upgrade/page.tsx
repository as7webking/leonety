'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface UpgradeContext {
  company: { id: string; name: string } | null
  currentPlan: 'free' | 'starter' | 'pro' | 'business'
  pendingRequest: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
  } | null
  isPro: boolean
  message?: string
}

export default function UpgradePage() {
  const [context, setContext] = useState<UpgradeContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadUpgradeContext = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/upgrade-request', { cache: 'no-store' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load upgrade details')
      }

      setContext(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load upgrade details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUpgradeContext()
  }, [])

  const requestProAccess = async () => {
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch('/api/upgrade-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'User requested Pro access from the upgrade page.',
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send Pro request')
      }

      setContext(data)
      setSuccess(data.message || 'Your Pro request has been sent for review.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to send Pro request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Upgrade to Pro"
        description="Request manual Pro access for your workspace."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Manual Pro upgrade</CardTitle>
          <CardDescription>
            Pro billing is not connected yet. Submit a request and an admin will review it manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Loading upgrade details...
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  {success}
                </div>
              )}

              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p>Workspace: {context?.company?.name ?? 'No workspace selected'}</p>
              </div>

              <div className="space-y-2 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Pro benefits</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>More workspace flexibility</li>
                  <li>Expanded account access limits</li>
                  <li>Manual admin activation while billing is being prepared</li>
                </ul>
              </div>

              {context?.isPro ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  You are already on Pro.
                </div>
              ) : context?.pendingRequest ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your Pro request is pending review.
                </div>
              ) : (
                <Button onClick={requestProAccess} disabled={submitting || !context?.company}>
                  {submitting ? 'Sending request...' : 'Request Pro Access'}
                </Button>
              )}

              <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                <Button asChild variant="outline">
                  <Link href="/profile">Open profile</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/dashboard">Back to dashboard</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
