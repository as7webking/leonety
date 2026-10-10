'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ShieldCheck, UserRoundCheck, UserRoundX, UsersRound, Warehouse } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'
import { getIntlLocale } from '@/lib/i18n'

interface DirectoryUser {
  id: string
  accountExists: boolean
  email: string
  displayName: string
  registeredAt: string
  lastSignInAt: string | null
  lastActivityAt: string | null
  activityStatus: 'recent' | 'inactive' | 'never' | 'unknown'
  provider: string
  status: 'active' | 'unconfirmed' | 'deactivated'
  hasProfile: boolean
  workspaceCount: number
  primaryWorkspace: string | null
}

interface DirectoryResponse {
  users: DirectoryUser[]
  activityTrackingAvailable: boolean
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  search: string
}

interface ConsistencySummary {
  authUsersWithoutProfile: number
  profilesWithoutAuthUser: number
  usersWithoutWorkspace: number
  usersWithMultipleWorkspaces: number
}

const statusClasses = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  unconfirmed: 'bg-amber-50 text-amber-700 ring-amber-200',
  deactivated: 'bg-red-50 text-red-700 ring-red-200',
}

export function AdminUsersClient() {
  const { locale, t } = useI18n()
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consistency, setConsistency] = useState<ConsistencySummary | null>(null)
  const [consistencyLoading, setConsistencyLoading] = useState(false)
  const [consistencyError, setConsistencyError] = useState('')

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }), [locale])

  const formatDate = (value: string | null) => {
    if (!value) return t('adminUsers.never')
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : t('adminUsers.never')
  }

  const formatActivityDate = (user: DirectoryUser) => {
    if (user.activityStatus === 'unknown') return t('adminUsers.activity.unknown')
    if (user.activityStatus === 'never') return t('adminUsers.never')
    return formatDate(user.lastActivityAt)
  }

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' })
      if (search) params.set('search', search)
      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: 'no-store',
        signal,
      })
      const data = await response.json() as DirectoryResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || 'directory_failed')

      setUsers(data.users)
      setTotal(data.pagination.total)
      setTotalPages(data.pagination.totalPages)
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setUsers([])
      setError(t('adminUsers.loadFailed'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, search, t])

  useEffect(() => {
    const controller = new AbortController()
    void loadUsers(controller.signal)
    return () => controller.abort()
  }, [loadUsers])

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const runConsistencyCheck = async () => {
    setConsistencyLoading(true)
    setConsistencyError('')

    try {
      const response = await fetch('/api/admin/users?mode=consistency', { cache: 'no-store' })
      const data = await response.json() as { consistency?: ConsistencySummary; error?: string }
      if (!response.ok || !data.consistency) throw new Error(data.error || 'consistency_failed')
      setConsistency(data.consistency)
    } catch {
      setConsistencyError(t('adminUsers.consistencyFailed'))
    } finally {
      setConsistencyLoading(false)
    }
  }

  const consistencyItems = consistency ? [
    { label: t('adminUsers.authWithoutProfile'), value: consistency.authUsersWithoutProfile, icon: UserRoundX },
    { label: t('adminUsers.profileWithoutAuth'), value: consistency.profilesWithoutAuthUser, icon: UserRoundX },
    { label: t('adminUsers.withoutWorkspace'), value: consistency.usersWithoutWorkspace, icon: Warehouse },
    { label: t('adminUsers.multipleWorkspaces'), value: consistency.usersWithMultipleWorkspaces, icon: UsersRound },
  ] : []

  return (
    <PageContainer className="max-w-screen-2xl">
      <PageHeader title={t('adminUsers.title')} description={t('adminUsers.description')} />

      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{t('adminUsers.readOnly')}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form className="flex min-w-0 flex-col gap-3 sm:flex-row" onSubmit={handleSearch}>
              <label className="min-w-0 flex-1">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('adminUsers.searchLabel')}</span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder={t('adminUsers.searchPlaceholder')}
                    maxLength={120}
                    className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </span>
              </label>
              <div className="flex flex-wrap items-end gap-2 sm:pb-px">
                <Button type="submit" disabled={loading}>{t('adminUsers.search')}</Button>
                {(search || searchInput) && (
                  <Button type="button" variant="outline" disabled={loading} onClick={clearSearch}>
                    {t('adminUsers.clear')}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <section aria-busy={loading}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span>{t('adminUsers.total').replace('{count}', String(total))}</span>
            <span>{t('adminUsers.page').replace('{page}', String(page)).replace('{pages}', String(totalPages))}</span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
              {t('adminUsers.noUsers')}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
                <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.name')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.registered')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.lastSignIn')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.lastActivity')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.provider')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.accountStatus')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.account')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.profile')}</th>
                      <th className="px-4 py-3 font-semibold">{t('adminUsers.workspaces')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="max-w-72 px-4 py-3 align-top">
                          <p className="break-words font-medium text-slate-900">{user.displayName || user.email}</p>
                          <p className="break-all text-slate-500">{user.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">{formatDate(user.registeredAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">{formatDate(user.lastSignInAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                          <p>{formatActivityDate(user)}</p>
                          <p className="mt-1 text-xs text-slate-500">{t(`adminUsers.activity.${user.activityStatus}`)}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{user.provider}</td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses[user.status]}`}>
                            {t(`adminUsers.status.${user.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{user.accountExists && t('adminUsers.accountExists')}</td>
                        <td className="px-4 py-3 align-top text-slate-600">{user.hasProfile ? t('adminUsers.profileLinked') : t('adminUsers.profileMissing')}</td>
                        <td className="max-w-56 px-4 py-3 align-top text-slate-600">
                          <p>{user.workspaceCount === 0 ? t('adminUsers.workspaceNone') : user.workspaceCount}</p>
                          {user.primaryWorkspace && <p className="break-words text-xs text-slate-500">{user.primaryWorkspace}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {users.map((user) => (
                  <article key={user.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words font-medium text-slate-900">{user.displayName || user.email}</p>
                        <p className="break-all text-sm text-slate-500">{user.email}</p>
                      </div>
                      <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses[user.status]}`}>
                        {t(`adminUsers.status.${user.status}`)}
                      </span>
                    </div>
                    <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                      <div><dt className="text-slate-500">{t('adminUsers.registered')}</dt><dd className="break-words text-slate-800">{formatDate(user.registeredAt)}</dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.lastSignIn')}</dt><dd className="break-words text-slate-800">{formatDate(user.lastSignInAt)}</dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.lastActivity')}</dt><dd className="break-words text-slate-800">{formatActivityDate(user)}<span className="block text-xs text-slate-500">{t(`adminUsers.activity.${user.activityStatus}`)}</span></dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.provider')}</dt><dd className="break-words text-slate-800">{user.provider}</dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.accountStatus')}</dt><dd className="text-slate-800">{t(`adminUsers.status.${user.status}`)}</dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.account')}</dt><dd className="text-slate-800">{user.accountExists && t('adminUsers.accountExists')}</dd></div>
                      <div><dt className="text-slate-500">{t('adminUsers.profile')}</dt><dd className="text-slate-800">{user.hasProfile ? t('adminUsers.profileLinked') : t('adminUsers.profileMissing')}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-slate-500">{t('adminUsers.workspaces')}</dt><dd className="break-words text-slate-800">{user.workspaceCount === 0 ? t('adminUsers.workspaceNone') : `${user.workspaceCount}${user.primaryWorkspace ? ` · ${user.primaryWorkspace}` : ''}`}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              {t('adminUsers.previous')}
            </Button>
            <Button type="button" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              {t('adminUsers.next')}
            </Button>
          </div>
        </section>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t('adminUsers.consistencyTitle')}</CardTitle>
              <CardDescription>{t('adminUsers.consistencyDescription')}</CardDescription>
            </div>
            <Button type="button" variant="outline" disabled={consistencyLoading} onClick={() => void runConsistencyCheck()}>
              <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
              {consistencyLoading ? t('adminUsers.checking') : t('adminUsers.runConsistency')}
            </Button>
          </CardHeader>
          <CardContent>
            {consistencyError && <p className="text-sm text-red-700" role="alert">{consistencyError}</p>}
            {consistency && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {consistencyItems.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="min-w-0 rounded-lg border border-slate-200 p-4">
                    <Icon className="mb-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                    <p className="text-2xl font-semibold text-slate-950">{value}</p>
                    <p className="mt-1 break-words text-sm text-slate-600">{label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
