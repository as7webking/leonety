import { NextResponse } from 'next/server'
import { callStopActiveTimer } from '@/lib/active-timers'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const timerId = typeof body?.timerId === 'string' ? body.timerId : null

    if (!timerId) {
      return NextResponse.json({ ok: true })
    }

    const supabase = await createServerSupabaseClient()
    await callStopActiveTimer(supabase, timerId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Active timer stop route failed:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
