'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { profileUpdateSchema, formatValidationError } from '@/lib/validations'
import { useAccountAccess } from '@/hooks/use-account-access'
import { currencyOptions, normalizeCurrencyCode } from '@/lib/currency'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, DollarSign, LogOut, BriefcaseBusiness } from 'lucide-react'

interface UserProfile {
  id: string
  profile_number?: number | null
  email: string
  full_name: string
  currency: string
  created_at: string
}

interface ManagedProfile {
  id: string
  email: string
  full_name: string
  created_at: string
  workspaceCount: number
  workspaceNames: string[]
  isAdmin: boolean
  isPro: boolean
  plan: 'free' | 'pro'
  subscriptionEndsAt: string | null
  subscriptionSource: 'default' | 'manual' | 'payment'
  subscriptionStatus: 'active' | 'canceled' | 'expired'
  isDeactivated: boolean
  lastSignInAt: string | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceCurrency, setWorkspaceCurrency] = useState('USD')
  const [message, setMessage] = useState('')
  const [managedProfiles, setManagedProfiles] = useState<ManagedProfile[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [monthsByProfile, setMonthsByProfile] = useState<Record<string, number>>({})
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, refreshCompanies } = useCompany()
  const { accountAccess } = useAccountAccess(profile?.email)
  const planLabel = accountAccess.plan === 'pro' ? 'Pro' : 'Free'

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name, currency, created_at')
          .eq('id', user.id)
          .single()

        if (error) throw error

        const { data: numberData } = await supabase
          .from('profiles')
          .select('profile_number')
          .eq('id', user.id)
          .maybeSingle()

        setProfile({ ...data, profile_number: numberData?.profile_number ?? null })
        setFullName(data.full_name)
        setCurrency(normalizeCurrencyCode(data.currency))
      } catch {
        setMessage('Error loading profile')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [supabase, router])

  useEffect(() => {
    if (currentCompany) {
      setWorkspaceName(currentCompany.name)
      setWorkspaceCurrency(normalizeCurrencyCode(currentCompany.currency ?? 'USD'))
    }
  }, [currentCompany])

  useEffect(() => {
    if (!accountAccess.isAdmin) return

    let active = true

    const loadManagedProfiles = async () => {
      setAdminLoading(true)

      try {
        const response = await fetch('/api/admin/access', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load managed profiles')
        }
        if (active) {
          setManagedProfiles(data.profiles ?? [])
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Failed to load admin controls')
        }
      } finally {
        if (active) {
          setAdminLoading(false)
        }
      }
    }

    void loadManagedProfiles()

    return () => {
      active = false
    }
  }, [accountAccess.isAdmin])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage('')

    try {
      const validationResult = profileUpdateSchema.safeParse({
        full_name: fullName,
        currency: currency,
      })

      if (!validationResult.success) {
        setMessage(formatValidationError(validationResult.error))
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          currency: currency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (error) throw error

      setMessage('Profile updated successfully!')
      setProfile(prev => prev ? {
        ...prev,
        full_name: fullName,
        currency: currency,
      } : null)

      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      if (error instanceof Error) {
        setMessage('Error: ' + error.message)
      } else {
        setMessage('Error updating profile')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch {
      setMessage('Error logging out')
    }
  }

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentCompany) {
      setMessage('No workspace selected')
      return
    }

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: workspaceName.trim() || currentCompany.name,
          currency: workspaceCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentCompany.id)

      if (error) throw error

      await refreshCompanies(currentCompany.id)
      setMessage('Workspace updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(error instanceof Error ? `Error: ${error.message}` : 'Error updating workspace')
    }
  }

  const handleAccessUpdate = async (
    targetUserId: string,
    makeAdmin: boolean,
    makePro: boolean,
    deactivateAccount?: boolean
  ) => {
    setAdminLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId,
          makeAdmin,
          makePro,
          deactivateAccount,
          monthsPaid: monthsByProfile[targetUserId] ?? 1,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update access')
      }

      setManagedProfiles(data.profiles ?? [])
      setMessage('Access updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage(error instanceof Error ? `Error: ${error.message}` : 'Error updating access')
    } finally {
      setAdminLoading(false)
    }
  }

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied.`)
      setTimeout(() => setMessage(''), 2000)
    } catch {
      setMessage(`Error: failed to copy ${label.toLowerCase()}`)
    }
  }

  const getMonthsForProfile = (profileId: string) => monthsByProfile[profileId] ?? 1

  const setMonthsForProfile = (profileId: string, nextValue: number) => {
    setMonthsByProfile((prev) => ({
      ...prev,
      [profileId]: Math.max(1, nextValue),
    }))
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader
          title="Loading..."
          description="Please wait..."
        />
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    )
  }

  if (!profile) {
    return (
      <PageContainer>
        <PageHeader
          title="Profile"
          description="Your account information"
        />
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <p className="text-red-700">Unable to load your profile. Please try again later.</p>
          </CardContent>
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Your Profile"
        description="Manage your account information"
      />

      <div className="grid w-full gap-6 lg:grid-cols-2">
        {/* Profile Information Card */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>View and update your personal details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {message && (
                <div className={`p-3 rounded-md text-sm ${
                  message.includes('Error')
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {message}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Email cannot be changed. Contact support if you need to update it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Default Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(normalizeCurrencyCode(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} - {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              Current Workspace
            </CardTitle>
            <CardDescription>Manage the active workspace here or open the full workspace management page.</CardDescription>
          </CardHeader>
          <CardContent>
            {currentCompany ? (
              <form onSubmit={handleSaveWorkspace} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Workspace name"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">Workspace Type</label>
                    <input
                      type="text"
                      value={currentCompany.type}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600 cursor-not-allowed capitalize"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Workspace Currency</label>
                    <select
                      value={workspaceCurrency}
                      onChange={(e) => setWorkspaceCurrency(normalizeCurrencyCode(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    >
                      {currencyOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} - {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Current plan: {planLabel}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" className="w-full">Save Workspace</Button>
                  <Button type="button" variant="outline" className="w-full" onClick={() => router.push('/workspaces')}>
                    Manage Workspaces
                  </Button>
                </div>
              </form>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Complete onboarding to create your first workspace.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">Current Plan</span>
              <span className="text-sm font-medium">{planLabel}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-gray-600">Account Created</span>
              <span className="text-sm font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">Account ID</span>
              <span className="text-xs font-mono text-gray-500 truncate max-w-xs">
                {profile.profile_number ?? profile.id}
              </span>
            </div>
          </CardContent>
        </Card>

        {accountAccess.isAdmin && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Admin Access Management</CardTitle>
              <CardDescription>Grant or revoke Pro access and admin rights for other profiles.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {adminLoading && managedProfiles.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  Loading profiles...
                </div>
              ) : managedProfiles.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  No profiles found.
                </div>
              ) : (
                managedProfiles.map((managedProfile) => {
                  const isCurrentUser = managedProfile.id === profile.id

                  return (
                    <div key={managedProfile.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {managedProfile.full_name || managedProfile.email}
                          </p>
                          <p className="text-sm text-slate-500">{managedProfile.email}</p>
                          <p className="text-sm text-slate-500">
                            Subscription: {managedProfile.plan.toUpperCase()}
                            {managedProfile.subscriptionEndsAt
                              ? ` · until ${new Date(managedProfile.subscriptionEndsAt).toLocaleDateString()}`
                              : ''}
                          </p>
                          <p className="text-sm text-slate-500">
                            Source: {managedProfile.subscriptionSource} · Status: {managedProfile.subscriptionStatus}
                          </p>
                          <p className="text-sm text-slate-500">
                            Account: {managedProfile.isDeactivated ? 'Deactivated' : 'Active'}
                            {managedProfile.lastSignInAt
                              ? ` · last sign-in ${new Date(managedProfile.lastSignInAt).toLocaleDateString()}`
                              : ''}
                          </p>
                          <p className="text-sm text-slate-500">
                            Workspaces: {managedProfile.workspaceCount}
                            {managedProfile.workspaceNames.length > 0 ? ` · ${managedProfile.workspaceNames.join(', ')}` : ''}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.isAdmin ? 'Admin' : 'User'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.isPro ? 'Pro' : 'Free'}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                              {managedProfile.subscriptionSource === 'payment' ? 'Paid automatically' : 'Manual access'}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs ${
                              managedProfile.isDeactivated
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {managedProfile.isDeactivated ? 'Deactivated' : 'Active account'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading}
                            onClick={() => handleCopy(managedProfile.email, 'Email')}
                          >
                            Copy Email
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading}
                            onClick={() => handleCopy(managedProfile.id, 'User ID')}
                          >
                            Copy ID
                          </Button>
                          <div
                            className="inline-flex items-center overflow-hidden rounded-md border border-gray-300 bg-white text-sm"
                            aria-label={`Months for ${managedProfile.email}`}
                          >
                            <button
                              type="button"
                              className="px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={adminLoading || getMonthsForProfile(managedProfile.id) <= 1}
                              onClick={() => setMonthsForProfile(managedProfile.id, getMonthsForProfile(managedProfile.id) - 1)}
                            >
                              -
                            </button>
                            <span className="min-w-20 border-x border-gray-300 px-3 py-2 text-center text-slate-700">
                              {getMonthsForProfile(managedProfile.id)} month{getMonthsForProfile(managedProfile.id) === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              className="px-3 py-2 text-slate-700 hover:bg-slate-50"
                              disabled={adminLoading}
                              onClick={() => setMonthsForProfile(managedProfile.id, getMonthsForProfile(managedProfile.id) + 1)}
                            >
                              +
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading}
                            onClick={() => handleAccessUpdate(managedProfile.id, managedProfile.isAdmin, !managedProfile.isPro)}
                          >
                            {managedProfile.isPro ? 'Remove Pro' : 'Grant Pro'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading || isCurrentUser}
                            onClick={() => handleAccessUpdate(managedProfile.id, !managedProfile.isAdmin, managedProfile.isPro)}
                          >
                            {managedProfile.isAdmin ? 'Remove Admin' : 'Make Admin'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={adminLoading || isCurrentUser}
                            onClick={() =>
                              handleAccessUpdate(
                                managedProfile.id,
                                managedProfile.isAdmin,
                                managedProfile.isPro,
                                !managedProfile.isDeactivated
                              )
                            }
                          >
                            {managedProfile.isDeactivated ? 'Reactivate' : 'Deactivate'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* Logout */}
        <Card className="border-red-200 bg-red-50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-red-700">Sign Out</CardTitle>
            <CardDescription className="text-red-600">
              End your current session
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full text-red-700 border-red-200 hover:bg-red-100"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}
