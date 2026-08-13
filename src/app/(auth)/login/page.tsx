'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { getAuthCallbackUrl, getSafeAppRedirectPath } from '@/lib/site-url'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { Logo } from '@/components/logo'
import { Eye, EyeOff } from 'lucide-react'

type OAuthProvider = 'google' | 'facebook'

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
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [acceptedLegal, setAcceptedLegal] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [supabase] = useState(() => createClient())
  const { t } = useI18n()

  useEffect(() => {
    if (pathname === '/signup' || searchParams.get('mode') === 'signup') {
      setIsSignUp(true)
    }
  }, [pathname, searchParams])

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
          throw new Error(t('auth.fullNameRequired'))
        }
        if (password.length < 6) {
          throw new Error(t('auth.passwordMinLength'))
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
            emailRedirectTo: getAuthCallbackUrl('/app/profile'),
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
          setSuccess(t('auth.checkEmailConfirmation'))
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
          const nextPath = getSafeAppRedirectPath(new URLSearchParams(window.location.search).get('next'))
          router.push(nextPath)
        }
      }
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Authentication failed:', error)
      }
      setError(t(isSignUp ? 'auth.signUpFailed' : 'auth.signInFailed'))
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
      setError(t('auth.enterEmailForConfirmation'))
      return
    }

    setIsResending(true)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo: getAuthCallbackUrl('/app/profile'),
        },
      })

      if (resendError) throw resendError

      setResendCooldown(60)
      setSuccess(t('auth.confirmationSent'))
    } catch (error: unknown) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Confirmation resend failed:', error)
      }
      setError(t('auth.confirmationFailed'))
    } finally {
      setIsResending(false)
    }
  }

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setOauthLoading(provider)
    setError('')
    setSuccess('')

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getAuthCallbackUrl(getSafeAppRedirectPath(new URLSearchParams(window.location.search).get('next'))),
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      })

      if (oauthError) throw oauthError
    } catch {
      const providerName = provider === 'google' ? 'Google' : 'Facebook'
      setError(t('auth.oauthFailed').replace('{provider}', providerName))
      setOauthLoading(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex justify-center">
            <Logo size="lg" />
          </div>
          <CardTitle>{isSignUp ? t('auth.createAccount') : t('auth.signIn')}</CardTitle>
          <CardDescription>
            {isSignUp ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              disabled={isLoading || oauthLoading !== null}
              onClick={() => handleOAuthSignIn('google')}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.43z" />
                <path fill="#34A853" d="M12 22c2.7 0 4.96-.89 6.62-2.34l-3.23-2.51c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22z" />
                <path fill="#FBBC05" d="M6.4 13.98A6.02 6.02 0 0 1 6.08 12c0-.69.12-1.35.32-1.98V7.43H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.57l3.34-2.59z" />
                <path fill="#EA4335" d="M12 5.9c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.96 2.91 14.7 2 12 2a10 10 0 0 0-8.94 5.43l3.34 2.59C7.19 7.66 9.4 5.9 12 5.9z" />
              </svg>
              {oauthLoading === 'google' ? t('auth.oauthRedirecting') : t('auth.continueWithGoogle')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              disabled={isLoading || oauthLoading !== null}
              onClick={() => handleOAuthSignIn('facebook')}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                f
              </span>
              {oauthLoading === 'facebook' ? t('auth.oauthRedirecting') : t('auth.continueWithFacebook')}
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            <span>{t('auth.orContinueWithEmail')}</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
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
                    ? t('auth.confirmationCooldown')
                    : t('auth.needAnotherConfirmation')}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={resendCooldown > 0 || isResending}
                  onClick={handleResendConfirmation}
                >
                  {resendCooldown > 0
                    ? t('auth.resendCountdown').replace('{seconds}', String(resendCooldown))
                    : isResending
                      ? t('auth.sending')
                      : t('auth.resendConfirmation')}
                </Button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                inputMode="email"
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.fullName')}</label>
                <input
                  name="name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('auth.fullNamePlaceholder')}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium mb-1">{t('profile.phone')}</label>
                <input
                  name="tel"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="+49 ..."
                  autoComplete="tel"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary pr-10"
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                  {t('auth.passwordHint')}
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
