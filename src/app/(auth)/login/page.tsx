'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { getAuthCallbackUrl } from '@/lib/site-url'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { t } = useI18n()

  useEffect(() => {
    if (resendCooldown <= 0) return

    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isSignUp) {
        // Signup with email confirmation
        if (!fullName.trim()) {
          throw new Error('Full name is required')
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters')
        }
        if (!acceptedLegal) {
          throw new Error(t('auth.acceptLegalRequired'))
        }

        const normalizedEmail = email.trim()
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName,
              currency: currency,
              phone: phone.trim() || null,
            },
            emailRedirectTo: getAuthCallbackUrl('/profile'),
          },
        })

        if (signUpError) {
          throw signUpError
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError(t('auth.accountExists'))
          return
        }

        if (data.user) {
          setConfirmationEmail(normalizedEmail)
          setResendCooldown(60)
          setSuccess('Check your email for confirmation link. You should be able to sign in once you confirm your email.')
          // Reset form
          setEmail('')
          setPassword('')
          setFullName('')
          setPhone('')
          setCurrency('EUR')
          setAcceptedLegal(false)
          setShowPassword(false)
        }
      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          throw signInError
        }

        if (data.session) {
          router.push('/app/dashboard')
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError('An error occurred. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    const targetEmail = (confirmationEmail || email).trim()

    if (resendCooldown > 0 || isResending) {
      return
    }

    setError('')
    setSuccess('')

    if (!targetEmail) {
      setError('Enter your email address to request another confirmation email.')
      return
    }

    setIsResending(true)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: getAuthCallbackUrl('/profile'),
        },
      })

      if (resendError) throw resendError

      setResendCooldown(60)
      setSuccess('Confirmation email sent. Please check your inbox.')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to resend confirmation email.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{isSignUp ? t('auth.createAccount') : t('auth.signIn')}</CardTitle>
          <CardDescription>
            {isSignUp ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                {success}
              </div>
            )}
            {isSignUp && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p>
                  {resendCooldown > 0
                    ? 'Please wait 60 seconds before requesting another confirmation email.'
                    : 'Need another confirmation link? Enter your email and request it here.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={resendCooldown > 0 || isResending}
                  onClick={handleResendConfirmation}
                >
                  {resendCooldown > 0 ? `You can resend in ${resendCooldown}s` : isResending ? 'Sending...' : 'Resend confirmation email'}
                </Button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="you@example.com"
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.fullName')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('profile.phone')}</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+49 ..."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {isSignUp && (
                <p className="text-xs text-gray-500 mt-1">
                  At least 6 characters
                </p>
              )}
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.mainCurrency')}</label>
                <AppSelect
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: 'USD', label: 'USD - United States Dollar' },
                    { value: 'EUR', label: 'EUR - Euro' },
                    { value: 'GBP', label: 'GBP - British Pound' },
                    { value: 'JPY', label: 'JPY - Japanese Yen' },
                    { value: 'CAD', label: 'CAD - Canadian Dollar' },
                    { value: 'AUD', label: 'AUD - Australian Dollar' },
                  ]}
                />
              </div>
            )}

            {isSignUp && (
              <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(event) => setAcceptedLegal(event.target.checked)}
                  className="mt-1 h-4 w-4"
                  required
                />
                <span>
                  {t('auth.acceptLegalPrefix')}{' '}
                  <Link href="/terms" className="font-medium text-blue-700 hover:underline" target="_blank">
                    {t('legal.terms')}
                  </Link>{' '}
                  {t('auth.acceptLegalAnd')}{' '}
                  <Link href="/privacy" className="font-medium text-blue-700 hover:underline" target="_blank">
                    {t('legal.privacy')}
                  </Link>
                  .
                </span>
              </label>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? t('common.loading') : isSignUp ? t('auth.createAccount') : t('auth.signIn')}
            </Button>
          </form>

          {!isSignUp && (
            <div className="mt-4 text-center">
              <Link href="/reset-password" className="text-sm font-medium text-blue-600 hover:underline">
                {t('auth.forgotPassword')}
              </Link>
            </div>
          )}

          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError('')
              setSuccess('')
            }}
            className="w-full mt-4 text-sm text-blue-600 hover:underline font-medium"
          >
            {isSignUp
              ? t('auth.alreadyHaveAccount')
              : t('auth.createOne')}
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
