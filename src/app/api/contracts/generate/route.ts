import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { contractLanguages, contractTemplateIds } from '@/lib/contracts'
import { generateContractDraft, rewriteContractClause } from '@/lib/contract-ai'

export const runtime = 'nodejs'

const MAX_BODY_LENGTH = 24_000
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 6
const rateLimits = new Map<string, { count: number; resetAt: number }>()

const partySchema = z.object({
  name: z.string().max(240).optional().default(''),
  company: z.string().max(240).optional().default(''),
  address: z.string().max(1000).optional().default(''),
  email: z.string().max(240).optional().default(''),
  phone: z.string().max(120).optional().default(''),
  taxId: z.string().max(120).optional().default(''),
  representative: z.string().max(240).optional().default(''),
  country: z.string().max(120).optional().default(''),
})

const termsSchema = z.object({
  effectiveDate: z.string().max(80).optional().default(''),
  projectDescription: z.string().max(3000).optional().default(''),
  scope: z.string().max(3000).optional().default(''),
  deliverables: z.string().max(3000).optional().default(''),
  price: z.string().max(120).optional().default(''),
  currency: z.string().max(12).optional().default('EUR'),
  paymentSchedule: z.string().max(1200).optional().default(''),
  deposit: z.string().max(1200).optional().default(''),
  milestones: z.string().max(2000).optional().default(''),
  startDate: z.string().max(80).optional().default(''),
  completionDate: z.string().max(80).optional().default(''),
  supportPeriod: z.string().max(1200).optional().default(''),
  intellectualProperty: z.string().max(2000).optional().default(''),
  confidentiality: z.string().max(2000).optional().default(''),
  termination: z.string().max(2000).optional().default(''),
  liability: z.string().max(2000).optional().default(''),
  governingLaw: z.string().max(240).optional().default(''),
  jurisdiction: z.string().max(240).optional().default(''),
  noticePeriod: z.string().max(240).optional().default(''),
  additionalClauses: z.string().max(4000).optional().default(''),
  customNotes: z.string().max(4000).optional().default(''),
})

const generateSchema = z.object({
  action: z.literal('generate'),
  companyId: z.string().uuid(),
  templateId: z.enum(contractTemplateIds),
  language: z.enum(contractLanguages),
  title: z.string().max(240).optional().default(''),
  jurisdiction: z.string().max(240).optional().default(''),
  partyA: partySchema,
  partyB: partySchema,
  terms: termsSchema,
})

const rewriteSchema = z.object({
  action: z.literal('rewrite_clause'),
  companyId: z.string().uuid(),
  language: z.enum(contractLanguages),
  rewriteAction: z.string().max(120),
  clause: z.object({
    heading: z.string().max(240),
    body: z.string().max(6000),
  }),
})

const requestSchema = z.discriminatedUnion('action', [generateSchema, rewriteSchema])

function checkRateLimit(userId: string) {
  const now = Date.now()
  const current = rateLimits.get(userId)

  if (!current || current.resetAt <= now) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (current.count >= RATE_LIMIT_MAX) return false
  current.count += 1
  return true
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_LENGTH) {
      return jsonError('contract_too_large', 413)
    }

    const parsed = requestSchema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) {
      return jsonError('invalid_contract_request', 400)
    }

    const auth = await requireOwnedCompany(parsed.data.companyId)
    if ('error' in auth) return auth.error

    if (!checkRateLimit(auth.user.id)) {
      return jsonError('rate_limited', 429)
    }

    if (parsed.data.action === 'rewrite_clause') {
      const clause = await rewriteContractClause({
        language: parsed.data.language,
        action: parsed.data.rewriteAction,
        clause: parsed.data.clause,
      })
      return NextResponse.json({ clause })
    }

    const document = await generateContractDraft({
      templateId: parsed.data.templateId,
      language: parsed.data.language,
      title: parsed.data.title,
      jurisdiction: parsed.data.jurisdiction,
      partyA: parsed.data.partyA,
      partyB: parsed.data.partyB,
      terms: parsed.data.terms,
    })

    return NextResponse.json({ document })
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[contracts.generate]', error instanceof Error ? error.message : 'Unknown error')
    }
    return jsonError('contract_generation_failed', 500)
  }
}
