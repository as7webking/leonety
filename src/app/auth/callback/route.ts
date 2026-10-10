import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSafeAppRedirectPath, getSiteUrl } from '@/lib/site-url'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const providerError = requestUrl.searchParams.get('error')
  const providerErrorCode = requestUrl.searchParams.get('error_code')
  const providerErrorDescription = requestUrl.searchParams.get('error_description')
  const next = getSafeAppRedirectPath(requestUrl.searchParams.get('next'))

  if (providerError) {
    const loginUrl = new URL('/login', getSiteUrl())
    const wasDenied = providerError === 'access_denied' || providerErrorCode === 'user_cancelled'
    loginUrl.searchParams.set('error', wasDenied ? 'auth_provider_denied' : 'auth_provider_error')

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auth.callback] Provider returned an OAuth error', {
        error: providerError,
        code: providerErrorCode,
        hasDescription: Boolean(providerErrorDescription),
      })
    }

    return NextResponse.redirect(loginUrl)
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient()
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[auth.callback] Code exchange failed', { message: exchangeError.message })
        }
        return NextResponse.redirect(new URL('/login?error=auth_callback_failed', getSiteUrl()))
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        return NextResponse.redirect(new URL('/login?error=session_missing', getSiteUrl()))
      }

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (profileLookupError) {
        console.error('[auth.callback] Profile lookup failed', { code: profileLookupError.code })
        return NextResponse.redirect(new URL('/login?error=auth_profile_failed', getSiteUrl()))
      }

      if (!existingProfile) {
        const fullName =
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === 'string'
              ? user.user_metadata.name
              : null

        const { error: profileInsertError } = await supabase.from('profiles').insert({
          id: user.id,
          email: user.email ?? null,
          full_name: fullName,
          currency: typeof user.user_metadata?.currency === 'string' ? user.user_metadata.currency : 'EUR',
        })

        if (profileInsertError) {
          // Another callback may have created the profile at the same time.
          const { data: concurrentlyCreatedProfile, error: retryLookupError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

          if (retryLookupError || !concurrentlyCreatedProfile) {
            console.error('[auth.callback] Profile creation failed', { code: profileInsertError.code })
            return NextResponse.redirect(new URL('/login?error=auth_profile_failed', getSiteUrl()))
          }
        }
      }

      const { count, error: companyLookupError } = await supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', user.id)

      if (companyLookupError) {
        console.error('[auth.callback] Workspace lookup failed', { code: companyLookupError.code })
        return NextResponse.redirect(new URL('/login?error=auth_workspace_check_failed', getSiteUrl()))
      }

      return NextResponse.redirect(new URL((count ?? 0) > 0 ? next : '/app/onboarding', getSiteUrl()))
    } catch (error) {
      console.error('[auth.callback] Unexpected callback failure', {
        category: error instanceof Error ? error.name : 'unknown',
      })
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', getSiteUrl()))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_missing_code', getSiteUrl()))
}
