import 'server-only'
import {
  getContractTemplate,
  getLanguageName,
  type ContractLanguage,
  type ContractPartySnapshot,
  type ContractTemplateId,
  type ContractTerms,
  type GeneratedContractDocument,
} from '@/lib/contracts'

export interface ContractGenerationInput {
  templateId: ContractTemplateId
  language: ContractLanguage
  title: string
  jurisdiction: string
  partyA: ContractPartySnapshot
  partyB: ContractPartySnapshot
  terms: ContractTerms
}

export interface ClauseRewriteInput {
  language: ContractLanguage
  action: string
  clause: {
    heading: string
    body: string
  }
}

type AiProvider = 'openai'

function getAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase()
  return provider === 'openai' || !provider ? 'openai' : 'openai'
}

function getAiModel() {
  return process.env.AI_MODEL?.trim() || 'gpt-5-mini'
}

function getAiApiKey() {
  const key = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error('AI_API_KEY is required server-side for contract generation.')
  }
  return key
}

function sanitizeText(value: unknown, maxLength = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function buildContractPrompt(input: ContractGenerationInput) {
  const template = getContractTemplate(input.templateId)
  return JSON.stringify({
    task: 'Generate a professional contract draft as structured JSON.',
    language: getLanguageName(input.language),
    strictRules: [
      'Write the entire contract in the requested language.',
      'Use clear numbered clauses.',
      'Do not invent missing company facts, tax IDs, addresses, prices, dates or legal citations.',
      'Use [TO BE COMPLETED] where important information is missing.',
      'Do not present the draft as legal advice.',
      'Do not include signatures that pretend to be already signed.',
    ],
    outputShape: {
      title: 'string',
      introduction: 'string',
      clauses: [{ id: 'short_slug', heading: 'string', body: 'string' }],
      closing: 'string',
    },
    template: {
      id: template.id,
      clauseOutline: template.clauseKeys,
    },
    userInput: {
      title: sanitizeText(input.title, 240),
      jurisdiction: sanitizeText(input.jurisdiction, 240),
      partyA: input.partyA,
      partyB: input.partyB,
      terms: input.terms,
    },
  })
}

function parseJsonDocument(text: string): GeneratedContractDocument {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as Partial<GeneratedContractDocument>

  return {
    title: sanitizeText(parsed.title, 240) || 'Contract draft',
    introduction: sanitizeText(parsed.introduction, 2000),
    clauses: Array.isArray(parsed.clauses)
      ? parsed.clauses.map((clause, index) => ({
          id: sanitizeText(clause?.id, 80) || `clause-${index + 1}`,
          heading: sanitizeText(clause?.heading, 240) || `Clause ${index + 1}`,
          body: sanitizeText(clause?.body, 6000),
        })).filter((clause) => clause.body)
      : [],
    closing: sanitizeText(parsed.closing, 2000),
  }
}

function extractResponseText(payload: unknown) {
  const record = payload as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>
  }

  if (typeof record.output_text === 'string') return record.output_text

  return record.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter(Boolean)
    .join('\n') ?? ''
}

async function callOpenAiJson(prompt: string, instructions: string, maxOutputTokens = 5000) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getAiModel(),
      instructions,
      input: prompt,
      max_output_tokens: maxOutputTokens,
      text: { format: { type: 'json_object' } },
    }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error('AI provider request failed.')
  }

  const text = extractResponseText(payload)
  if (!text) throw new Error('AI provider returned an empty response.')
  return text
}

export async function generateContractDraft(input: ContractGenerationInput): Promise<GeneratedContractDocument> {
  getAiProvider()
  const text = await callOpenAiJson(
    buildContractPrompt(input),
    'You are a contract drafting assistant. Produce only valid JSON matching the requested shape. This is a draft, not legal advice.'
  )
  return parseJsonDocument(text)
}

export async function rewriteContractClause(input: ClauseRewriteInput) {
  getAiProvider()
  const action = sanitizeText(input.action, 120)
  const prompt = JSON.stringify({
    task: 'Rewrite one contract clause.',
    language: getLanguageName(input.language),
    action,
    rules: [
      'Keep the result in the requested language.',
      'Do not invent missing facts or legal citations.',
      'Return only JSON with heading and body.',
    ],
    clause: {
      heading: sanitizeText(input.clause.heading, 240),
      body: sanitizeText(input.clause.body, 6000),
    },
  })
  const text = await callOpenAiJson(prompt, 'Rewrite a single contract clause and return only valid JSON.', 1800)
  const parsed = JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()) as { heading?: string; body?: string }
  return {
    heading: sanitizeText(parsed.heading, 240) || input.clause.heading,
    body: sanitizeText(parsed.body, 6000) || input.clause.body,
  }
}
