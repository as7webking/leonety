import { NextResponse } from 'next/server'
import { getAccountAccess } from '@/lib/account-access'
import { resolveAccountAccessForUser } from '@/lib/account-access-server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ accountAccess: getAccountAccess(null) }, { status: 401 })
    }

    const resolved = await resolveAccountAccessForUser(authData.user.id, authData.user.email)
    return NextResponse.json({ accountAccess: resolved.accountAccess })
  } catch (error) {
    console.error('Account access lookup failed:', error)
    return NextResponse.json({ accountAccess: getAccountAccess(null) }, { status: 500 })
  }
}
