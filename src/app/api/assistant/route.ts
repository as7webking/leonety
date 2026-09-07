import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateAiText, getAiConfigurationStatus } from '@/lib/ai-provider'
import { defaultLocale, normalizeLocale, type Locale } from '@/lib/i18n'
import { buildLeonetyAssistantKnowledge, normalizeAssistantRoute } from '@/lib/leonety-assistant-knowledge'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const requestSchema = z.object({
  locale: z.string().optional(),
  pathname: z.string().optional(),
  companyId: z.string().uuid().optional().nullable(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1800),
  })).min(1).max(12),
})

const rateLimit = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

function checkRateLimit(userId: string) {
  const now = Date.now()
  const current = rateLimit.get(userId)

  if (!current || current.resetAt <= now) {
    rateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (current.count >= RATE_LIMIT_MAX) return false

  current.count += 1
  return true
}

function buildConversationInput(locale: Locale, pathname: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  return JSON.stringify({
    context: buildLeonetyAssistantKnowledge(locale, pathname),
    conversation: messages.map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1800),
    })),
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
    }

    if (!checkRateLimit(authData.user.id)) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
    }

    const { companyId } = parsed.data
    if (companyId) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('id', companyId)
        .eq('owner_id', authData.user.id)
        .maybeSingle()

      if (companyError) {
        return NextResponse.json({ error: 'workspace_check_failed' }, { status: 500 })
      }

      if (!company) {
        return NextResponse.json({ error: 'workspace_access_denied' }, { status: 403 })
      }
    }

    const aiStatus = getAiConfigurationStatus()
    if (!aiStatus.configured) {
      return NextResponse.json({ error: 'provider_unavailable' }, { status: 503 })
    }

    const locale = normalizeLocale(parsed.data.locale ?? defaultLocale)
    const pathname = normalizeAssistantRoute(parsed.data.pathname)
    const answer = await generateAiText({
      instructions: [
        'You are Leonety AI Assistant, an authenticated product assistant for Leonety.',
        'Answer in the current UI language unless the user clearly writes in another supported Leonety language.',
        'Use only the supplied Leonety knowledge. If unsure, say that you do not know and suggest where in Leonety to check.',
        'Do not provide accounting, tax, legal, financial or certified e-signature advice.',
        'Do not claim you performed destructive actions. You may explain steps only.',
        'Never ask for or reveal API keys, OAuth secrets, Supabase keys, Paddle secrets, WhatsApp tokens or service role credentials.',
        'Keep the response concise and practical.',
      ].join('\n'),
      input: buildConversationInput(locale, pathname, parsed.data.messages),
      maxOutputTokens: 850,
    })

    return NextResponse.json({ answer })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[assistant]', error instanceof Error ? error.message : 'Unknown assistant error')
    }

    return NextResponse.json({ error: 'assistant_failed' }, { status: 500 })
  }
}
