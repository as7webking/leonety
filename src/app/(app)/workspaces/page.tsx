'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { canCreateWorkspace } from '@/lib/account-access'
import { useAccountAccess } from '@/hooks/use-account-access'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { Plus, Trash2 } from 'lucide-react'

type WorkspaceType = 'personal' | 'business'

type RelatedCount = {
  label: string
  table: 'incomes' | 'expenses' | 'time_entries' | 'active_timers'
}

const relatedTables: RelatedCount[] = [
  { label: 'income records', table: 'incomes' },
  { label: 'expense records', table: 'expenses' },
  { label: 'time entries', table: 'time_entries' },
  { label: 'active timers', table: 'active_timers' },
]

export default function WorkspacesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { companies, currentCompanyId, loading, setCurrentCompanyId, refreshCompanies } = useCompany()
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileCurrency, setProfileCurrency] = useState('USD')
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('personal')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCurrency, setWorkspaceCurrency] = useState('USD')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { accountAccess } = useAccountAccess(accountEmail)
  const canAddWorkspace = canCreateWorkspace(companies.length, accountAccess)

  const currentWorkspaceName = useMemo(
    () => companies.find((company) => company.id === currentCompanyId)?.name ?? 'No workspace selected',
    [companies, currentCompanyId],
  )

  useEffect(() => {
    const loadUserContext = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user

      if (!user) {
        setUserId(null)
        setAccountEmail(null)
        router.replace('/login')
        return
      }

      setUserId(user.id)
      setAccountEmail(user.email ?? null)

      const { data: profile } = await supabase
        .from('profiles')
        .select('currency')
        .eq('id', user.id)
        .maybeSingle()

      const nextCurrency = normalizeCurrencyCode(profile?.currency ?? 'USD')
      setProfileCurrency(nextCurrency)
      setWorkspaceCurrency(nextCurrency)
    }

    void loadUserContext()
  }, [router, supabase])

  const handleCreateWorkspace = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setSubmitting(true)

    try {
      if (!userId) {
        setMessage('Please sign in to create a workspace.')
        return
      }

      if (!canAddWorkspace) {
        setMessage('Workspace limit reached. Upgrade Plan to add more workspaces.')
        return
      }

      const trimmedName = workspaceName.trim()

      if (workspaceType === 'business' && !trimmedName) {
        setMessage('Company name is required for a business workspace.')
        return
      }

      const name = trimmedName || 'Personal Workspace'
      const { data, error } = await supabase
        .from('companies')
        .insert({
          owner_id: userId,
          name,
          type: workspaceType,
          currency: normalizeCurrencyCode(workspaceCurrency || profileCurrency),
        })
        .select('id')
        .single()

      if (error) throw error

      setWorkspaceName('')
      setWorkspaceType('personal')
      await refreshCompanies(data.id)
      setMessage('Workspace created.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create workspace.')
    } finally {
      setSubmitting(false)
    }
  }

  const getBlockingReason = async (companyId: string) => {
    const counts = await Promise.all(
      relatedTables.map(async (item) => {
        const { count, error } = await supabase
          .from(item.table)
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)

        if (error) throw error

        return { label: item.label, count: count ?? 0 }
      }),
    )

    return counts.filter((item) => item.count > 0)
  }

  const handleDeleteWorkspace = async (companyId: string) => {
    setMessage('')
    setDeletingId(companyId)

    try {
      if (!userId) {
        setMessage('Please sign in to delete a workspace.')
        return
      }

      if (companies.length <= 1) {
        setMessage('You cannot delete your last remaining workspace.')
        return
      }

      const blockingCounts = await getBlockingReason(companyId)

      if (blockingCounts.length > 0) {
        const details = blockingCounts.map((item) => `${item.count} ${item.label}`).join(', ')
        setMessage(`This workspace contains ${details}. Delete or move those records before deleting the workspace.`)
        setConfirmDeleteId(null)
        return
      }

      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId)
        .eq('owner_id', userId)

      if (error) throw error

      const nextWorkspaceId = companies.find((company) => company.id !== companyId)?.id ?? null
      await refreshCompanies(nextWorkspaceId)
      setConfirmDeleteId(null)
      setMessage('Workspace deleted.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete workspace.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Workspaces"
        description={`Current workspace: ${currentWorkspaceName}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-4">
          {message && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Your Workspaces</CardTitle>
              <CardDescription>Switch between workspaces or safely remove empty workspaces.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Loading workspaces...
                </div>
              ) : companies.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  No workspaces yet. Create your first workspace to continue.
                </div>
              ) : (
                companies.map((company) => {
                  const isCurrent = company.id === currentCompanyId
                  const isConfirming = confirmDeleteId === company.id

                  return (
                    <div key={company.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-slate-900">{company.name}</h2>
                            {isCurrent && (
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white">Current</span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize text-slate-600">
                              {company.type}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500">
                            Created {new Date(company.created_at).toLocaleDateString()} · {company.currency ?? 'USD'}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isCurrent}
                            onClick={() => {
                              setCurrentCompanyId(company.id)
                              setMessage('Workspace switched.')
                            }}
                          >
                            Switch Workspace
                          </Button>
                          {isConfirming ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={deletingId === company.id}
                                onClick={() => handleDeleteWorkspace(company.id)}
                              >
                                Confirm Delete
                              </Button>
                              <Button type="button" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={companies.length <= 1 || deletingId === company.id}
                              onClick={() => setConfirmDeleteId(company.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Workspace</CardTitle>
              <CardDescription>Add a personal or business workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAddWorkspace ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Workspace limit reached. Upgrade Plan to add more workspaces.
                  </div>
                  <Button asChild>
                    <Link href="/upgrade">Upgrade Plan</Link>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Workspace type</label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(['personal', 'business'] as WorkspaceType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setWorkspaceType(type)}
                          className={`rounded-md border px-3 py-3 text-left text-sm capitalize ${
                            workspaceType === type ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">
                      {workspaceType === 'business' ? 'Company name' : 'Workspace name'}
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                      className="w-full rounded-md border px-3 py-2"
                      placeholder={workspaceType === 'business' ? 'Acme Studio LLC' : 'Personal Workspace'}
                      required={workspaceType === 'business'}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Workspace currency</label>
                    <select
                      value={workspaceCurrency}
                      onChange={(event) => setWorkspaceCurrency(normalizeCurrencyCode(event.target.value))}
                      className="w-full rounded-md border px-3 py-2"
                    >
                      {currencyOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} - {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button type="submit" disabled={submitting}>
                    <Plus className="mr-2 h-4 w-4" />
                    {submitting ? 'Creating...' : 'Create Workspace'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
