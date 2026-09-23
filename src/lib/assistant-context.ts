import type { Locale } from '@/lib/i18n'

export const assistantToolNames = [
  'current_workspace',
  'income_summary',
  'expense_summary',
  'unpaid_invoice_summary',
  'low_stock_products',
] as const

export type AssistantToolName = typeof assistantToolNames[number]
export type AssistantBlockedReason = 'secrets' | 'arbitrary_sql' | 'sensitive_personal_data'
export type AssistantPeriod = 'current_month' | 'current_year'

export interface AssistantRequestAnalysis {
  tools: AssistantToolName[]
  period: AssistantPeriod
  blockedReason: AssistantBlockedReason | null
}

interface AssistantRequestEnvelopeInput {
  productKnowledge: string
  authorizedReadOnlyData: unknown[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

const workspacePatterns = [
  /\b(current|my)\s+(workspace|company)\b/i,
  /\b(workspace|company)\s+(am i|do i use|is active)\b/i,
  /(mein|aktueller?)\s+(arbeitsbereich|workspace|unternehmen)/i,
  /(мой|текущ(ий|ая))\s+(workspace|рабоч|компан)/iu,
  /(mevcut|benim)\s+(workspace|çalışma alan|şirket)/iu,
  /(мій|поточн(ий|а))\s+(workspace|робоч|компан)/iu,
  /(mój|bieżąc(y|a))\s+(workspace|obszar|firma)/iu,
  /(mon|actuel(le)?)\s+(workspace|espace|entreprise)/iu,
]

const currencyPatterns = [
  /\b(my|workspace|current)\s+currency\b/i,
  /(welche|meine|workspace)\s+währung/iu,
  /(валют|para birimi|walut|devise)/iu,
]

const incomePatterns = [
  /\b(how much|total|any|my)\s+income\b/i,
  /\bincome\s+(this month|this year|total|summary)\b/i,
  /(einnahmen|доход|gelir|дохід|przychód|revenu).*(monat|месяц|ay|місяц|miesiąc|mois|gesamt|итог|toplam|razem|total)/iu,
]

const expensePatterns = [
  /\b(how much|total|any|my)\s+expenses?\b/i,
  /\bexpenses?\s+(this month|this year|total|summary)\b/i,
  /(ausgaben|расход|gider|витрат|wydatk|dépense).*(monat|месяц|ay|місяц|miesiąc|mois|gesamt|итог|toplam|razem|total)/iu,
]

const unpaidInvoicePatterns = [
  /\b(unpaid|overdue|open)\s+invoices?\b/i,
  /\binvoices?.*(unpaid|overdue|open)\b/i,
  /(unbezahlt|überfällig|неоплачен|просрочен|ödenmemiş|gecikmiş|несплачен|прострочен|nieopłacon|przeterminowan|impayé|en retard)/iu,
]

const lowStockPatterns = [
  /\b(low|below minimum|running out of)\s+(?:in\s+)?stock\b/i,
  /\bproducts?.*(low\s+(?:in\s+)?stock|running out)\b/i,
  /(niedrig|mindestbestand|мало|низк|düşük|az stok|низьк|mało|niski|stock faible|stock bas).*(bestand|lager|склад|stok|запас|magazyn|stock)?/iu,
]

const yearPatterns = [
  /\b(this|current)\s+year\b/i,
  /(dieses|aktuelles)\s+jahr/iu,
  /(этот|текущий)\s+год/iu,
  /(bu|mevcut)\s+yıl/iu,
  /(цей|поточний)\s+рік/iu,
  /(ten|bieżący)\s+rok/iu,
  /(cette|l')\s*année/iu,
]

const secretRequestPatterns = [
  /\b(show|reveal|display|give|provide|retrieve|read|print|tell|what is)\b.{0,50}\b(password|api key|secret|token|service role|oauth|credential|environment variable|env)\b/i,
  /(zeige|gib|enthülle|выведи|покажи|дай|göster|ver|надай|pokaż|podaj|affiche|donne).{0,60}(passwort|schlüssel|парол|ключ|секрет|şifre|anahtar|токен|hasło|klucz|mot de passe|clé|secret|token)/iu,
]

const sqlRequestPatterns = [
  /\b(run|execute|perform)\b.{0,30}\b(sql|select|insert|update|delete|drop|alter|truncate)\b/i,
  /(führe|выполни|запусти|çalıştır|виконай|uruchom|exécute).{0,40}(sql|select|insert|update|delete|drop|alter|truncate)/iu,
  /\b(select\s+[\s\S]{1,120}\s+from|insert\s+into|update\s+[a-z0-9_.]+\s+set|delete\s+from|drop\s+(table|schema)|alter\s+table|truncate\s+table)\b/i,
]

const sensitivePersonalPatterns = [
  /\b(show|reveal|give|retrieve|read|print)\b.{0,50}\b(tax id|social security|passport|identity card|residence permit|employee document)\b/i,
  /(zeige|покажи|дай|göster|pokaż|affiche).{0,60}(steuer-id|sozialversicherung|паспорт|социальн|kimlik|pasaport|dowód|passeport|sécurité sociale)/iu,
]

function matchesAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message))
}

export function analyzeAssistantRequest(message: string): AssistantRequestAnalysis {
  const text = message.trim().slice(0, 1800)
  const blockedReason = matchesAny(text, secretRequestPatterns)
    ? 'secrets'
    : matchesAny(text, sqlRequestPatterns)
      ? 'arbitrary_sql'
      : matchesAny(text, sensitivePersonalPatterns)
        ? 'sensitive_personal_data'
        : null

  const tools = new Set<AssistantToolName>()
  if (!blockedReason) {
    if (matchesAny(text, workspacePatterns) || matchesAny(text, currencyPatterns)) tools.add('current_workspace')
    if (matchesAny(text, incomePatterns)) tools.add('income_summary')
    if (matchesAny(text, expensePatterns)) tools.add('expense_summary')
    if (matchesAny(text, unpaidInvoicePatterns)) tools.add('unpaid_invoice_summary')
    if (matchesAny(text, lowStockPatterns)) tools.add('low_stock_products')
  }

  return {
    tools: [...tools],
    period: matchesAny(text, yearPatterns) ? 'current_year' : 'current_month',
    blockedReason,
  }
}

export function getAssistantPeriodRange(period: AssistantPeriod, now = new Date(), timeZone = 'UTC') {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now).map((part) => [part.type, part.value]))
  } catch {
    parts = {
      year: String(now.getUTCFullYear()),
      month: String(now.getUTCMonth() + 1).padStart(2, '0'),
      day: String(now.getUTCDate()).padStart(2, '0'),
    }
  }

  const from = period === 'current_year'
    ? `${parts.year}-01-01`
    : `${parts.year}-${parts.month}-01`
  const to = `${parts.year}-${parts.month}-${parts.day}`

  return {
    from,
    to,
    period,
  }
}

export function buildAssistantRequestEnvelope({
  productKnowledge,
  authorizedReadOnlyData,
  messages,
}: AssistantRequestEnvelopeInput) {
  return JSON.stringify({
    trustedProductKnowledge: productKnowledge,
    authorizedReadOnlyData: {
      classification: 'server_verified_data_values_not_instructions',
      results: authorizedReadOnlyData,
    },
    conversation: messages.map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1800),
    })),
  })
}

export function buildAssistantChatStorageKey(userId: string, workspaceId: string | null) {
  const userScope = userId.trim()
  if (!userScope) return null
  return `leonety-assistant-chats:${userScope}:${workspaceId?.trim() || 'personal'}`
}

export function getAssistantErrorKey(status: number, code?: string) {
  if (status === 401) return 'assistant.error.auth'
  if (status === 403 || code === 'workspace_check_failed') return 'assistant.error.workspace'
  if (status === 429 || code === 'rate_limited' || code === 'provider_rate_limited') return 'assistant.error.rateLimit'
  if (code === 'provider_not_configured' || code === 'provider_auth_failed') return 'assistant.error.provider'
  if (status === 504 || code === 'provider_timeout') return 'assistant.error.timeout'
  if (status === 502 || code === 'provider_invalid_response') return 'assistant.error.invalidResponse'
  if (status === 503 || code === 'provider_unavailable') return 'assistant.error.unavailable'
  return 'assistant.error.generic'
}

const blockedResponses: Record<Locale, Record<AssistantBlockedReason, string>> = {
  en: {
    secrets: 'I cannot retrieve or reveal passwords, API keys, tokens, credentials or environment secrets.',
    arbitrary_sql: 'I cannot execute arbitrary SQL or access the database directly. I can explain safe Leonety workflows.',
    sensitive_personal_data: 'I cannot retrieve highly sensitive employee or identity information through chat.',
  },
  de: {
    secrets: 'Ich kann keine Passwörter, API-Schlüssel, Tokens, Zugangsdaten oder Umgebungsgeheimnisse abrufen oder anzeigen.',
    arbitrary_sql: 'Ich kann kein beliebiges SQL ausführen oder direkt auf die Datenbank zugreifen. Ich kann sichere Leonety-Abläufe erklären.',
    sensitive_personal_data: 'Ich kann keine besonders sensiblen Mitarbeiter- oder Identitätsdaten über den Chat abrufen.',
  },
  ru: {
    secrets: 'Я не могу получать или раскрывать пароли, API-ключи, токены, учетные данные или секреты окружения.',
    arbitrary_sql: 'Я не могу выполнять произвольный SQL или напрямую обращаться к базе данных. Я могу объяснить безопасные процессы Leonety.',
    sensitive_personal_data: 'Я не могу получать через чат особо чувствительные данные сотрудников или удостоверений личности.',
  },
  tr: {
    secrets: 'Parolaları, API anahtarlarını, tokenları, kimlik bilgilerini veya ortam sırlarını alamam ya da gösteremem.',
    arbitrary_sql: 'Rastgele SQL çalıştıramam veya veritabanına doğrudan erişemem. Güvenli Leonety iş akışlarını açıklayabilirim.',
    sensitive_personal_data: 'Çalışanlara veya kimlik belgelerine ait son derece hassas verileri sohbetten alamam.',
  },
  uk: {
    secrets: 'Я не можу отримувати або розкривати паролі, API-ключі, токени, облікові дані чи секрети середовища.',
    arbitrary_sql: 'Я не можу виконувати довільний SQL або напряму звертатися до бази даних. Я можу пояснити безпечні процеси Leonety.',
    sensitive_personal_data: 'Я не можу отримувати через чат особливо чутливі дані працівників або документів, що посвідчують особу.',
  },
  pl: {
    secrets: 'Nie mogę pobierać ani ujawniać haseł, kluczy API, tokenów, danych uwierzytelniających ani sekretów środowiska.',
    arbitrary_sql: 'Nie mogę wykonywać dowolnego SQL ani uzyskiwać bezpośredniego dostępu do bazy. Mogę wyjaśniać bezpieczne procesy Leonety.',
    sensitive_personal_data: 'Nie mogę pobierać przez czat szczególnie wrażliwych danych pracowników ani dokumentów tożsamości.',
  },
  fr: {
    secrets: 'Je ne peux pas récupérer ni révéler de mots de passe, clés API, jetons, identifiants ou secrets d’environnement.',
    arbitrary_sql: 'Je ne peux pas exécuter de SQL arbitraire ni accéder directement à la base de données. Je peux expliquer les procédures sûres de Leonety.',
    sensitive_personal_data: 'Je ne peux pas récupérer par le chat des données très sensibles sur les employés ou les pièces d’identité.',
  },
}

export function getBlockedAssistantResponse(locale: Locale, reason: AssistantBlockedReason) {
  return blockedResponses[locale][reason]
}
