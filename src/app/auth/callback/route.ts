import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getSafeAppRedirectPath, getSiteUrl } from '@/lib/site-url'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = getSafeAppRedirectPath(requestUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', getSiteUrl()))
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login?error=session_missing', getSiteUrl()))
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (!existingProfile) {
      const fullName =
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === 'string'
            ? user.user_metadata.name
            : null

      await supabase.from('profiles').insert({
        id: user.id,
        email: user.email ?? null,
        full_name: fullName,
        currency: typeof user.user_metadata?.currency === 'string' ? user.user_metadata.currency : 'EUR',
      })
    }

    const { count } = await supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)

    return NextResponse.redirect(new URL((count ?? 0) > 0 ? next : '/app/onboarding', getSiteUrl()))
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_missing_code', getSiteUrl()))
}
