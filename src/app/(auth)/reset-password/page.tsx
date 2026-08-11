'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getAuthCallbackUrl } from '@/lib/site-url'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/contexts/i18n-context'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { t } = useI18n()
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

      setMessage(t('auth.passwordResetSent'))
    } catch (resetError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Password reset request failed:', resetError)
      }
      setError(t('auth.passwordResetFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setError('')

    if (newPassword.length < 6) {
      setError(t('auth.passwordMinLength'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError

      setMessage(t('auth.passwordUpdated'))
      window.setTimeout(() => router.push('/app/profile'), 800)
    } catch (updateError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Password update failed:', updateError)
      }
      setError(t('auth.passwordUpdateFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isUpdateMode ? t('auth.setNewPassword') : t('auth.resetPassword')}</CardTitle>
          <CardDescription>
            {isUpdateMode
              ? t('auth.resetPasswordUpdateDescription')
              : t('auth.resetPasswordEmailDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isUpdateMode ? handlePasswordUpdate : handleSubmit} className="space-y-4">
            {message && <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {isUpdateMode ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('auth.newPassword')}</label>
                  <input
                    name="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t('auth.confirmPassword')}</label>
                  <input
                    name="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-medium">{t('auth.email')}</label>
                <input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                  inputMode="email"
                  required
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t('auth.pleaseWait') : isUpdateMode ? t('auth.updatePassword') : t('auth.sendResetLink')}
            </Button>
          </form>
          <Link href="/login" className="mt-4 block text-center text-sm font-medium text-blue-600 hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
