'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getAuthCallbackUrl } from '@/lib/site-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUpdateMode, setIsUpdateMode] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsUpdateMode(params.get('mode') === 'update')
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setIsLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthCallbackUrl('/reset-password?mode=update'),
      })

      if (resetError) throw resetError

      setMessage('Password reset email sent. Please check your inbox.')
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to send password reset email.')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      setMessage('Password updated successfully. Redirecting to your profile...')
      window.setTimeout(() => router.push('/app/profile'), 800)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isUpdateMode ? 'Set New Password' : 'Reset Password'}</CardTitle>
          <CardDescription>
            {isUpdateMode
              ? 'Enter your new password to finish the reset.'
              : 'Enter your email and we will send a secure reset link.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isUpdateMode ? handlePasswordUpdate : handleSubmit} className="space-y-4">
            {message && <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {isUpdateMode ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your new password"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Confirm your new password"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="you@example.com"
                  required
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Please wait...' : isUpdateMode ? 'Update Password' : 'Send Reset Link'}
            </Button>
          </form>
          <Link href="/login" className="mt-4 block text-center text-sm font-medium text-blue-600 hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
