import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    }

    const adminSupabase = createSupabaseAdminClient()
    const { error: activityError } = await adminSupabase.rpc('record_leonety_user_activity', {
      p_user_id: data.user.id,
    })

    if (activityError) {
      console.warn('[activity.heartbeat] write_unavailable', {
        code: activityError.code ?? 'unknown',
      })
    }
  } catch (error) {
    console.warn('[activity.heartbeat] unavailable', {
      category: error instanceof Error ? error.name : 'unknown_error',
    })
  }

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
