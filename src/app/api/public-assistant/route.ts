import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateAiText, getAiConfigurationStatus } from '@/lib/ai-provider'
import { defaultLocale, normalizeLocale } from '@/lib/i18n'
import { buildPublicAssistantKnowledge } from '@/lib/public-assistant-knowledge'

export const runtime = 'nodejs'

const requestSchema = z.object({
  locale: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(600),
  })).min(1).max(6),
})

const SESSION_COOKIE = 'leonety-public-ai-session'
const WINDOW_MS = 10 * 60_000
const MAX_REQUESTS = 6
const buckets = new Map<string, { count: number; resetAt: number }>()

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function allow(key: string) {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (current.count >= MAX_REQUESTS) return false
  current.count += 1
  return true
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
}

function withSession(response: NextResponse, session: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
  }
  return response
}

export async function POST(request: Request) {
  const existingSession = getCookie(request, SESSION_COOKIE)
  const session = existingSession || randomUUID()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  const allowed = allow(`ip:${hash(ip)}`) && allow(`session:${hash(session)}`)

  if (!allowed) {
    return withSession(NextResponse.json({ error: 'rate_limited' }, { status: 429 }), session, !existingSession)
  }

  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return withSession(NextResponse.json({ error: 'invalid_request' }, { status: 400 }), session, !existingSession)
    }

    if (!getAiConfigurationStatus().configured) {
      return withSession(NextResponse.json({ error: 'provider_unavailable' }, { status: 503 }), session, !existingSession)
    }

    const locale = normalizeLocale(parsed.data.locale ?? defaultLocale)
    const answer = await generateAiText({
      instructions: [
        'You are the public Leonety product assistant.',
        'Answer in the requested locale unless the visitor clearly writes in another supported language: English, German, Russian, Turkish, Ukrainian, Polish or French.',
        'Use only the supplied public product facts. If a detail is not present, say that it is not confirmed.',
        'Never claim access to an account, workspace or private business data.',
        'Never ask for passwords, API keys, OAuth secrets, tokens, payment details or customer records.',
        'Do not provide legal, tax, accounting or financial advice.',
        'Do not claim that setup-required, beta or coming-soon integrations are fully available.',
        'Keep the answer practical and under 180 words.',
      ].join('\n'),
      input: JSON.stringify({
        publicKnowledge: buildPublicAssistantKnowledge(locale),
        conversation: parsed.data.messages,
      }),
      maxOutputTokens: 320,
    })

    return withSession(NextResponse.json({ answer }), session, !existingSession)
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[public-assistant]', error instanceof Error ? error.message : 'Unknown public assistant error')
    }
    return withSession(NextResponse.json({ error: 'assistant_failed' }, { status: 500 }), session, !existingSession)
  }
}
