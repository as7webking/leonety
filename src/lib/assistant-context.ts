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
export type AssistantRequestScope = 'IN_SCOPE' | 'OUT_OF_SCOPE' | 'UNCLEAR' | 'GREETING'

export interface AssistantScopeContext {
  pathname?: string | null
}

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

const leonetyDomainPatterns = [
  /\bleonety\b/i,
  /\b(dashboard|workspace|company|income|expense|transaction|invoice|client|contract|product|inventory|stock|stock movement|employee|shift|time tracking|kassenbuch|cashbook|notification|integration|settings|profile|woocommerce)\b/i,
  /\b(dashboard|arbeitsbereich|unternehmen|einnahmen|ausgaben|transaktion|rechnung|kunde|vertrag|produkt|inventar|lagerbestand|warenbestand|lagerbewegung|mitarbeiter|schicht|zeiterfassung|kassenbuch|benachrichtigung|integration|einstellungen|profil)\b/iu,
  /(рабоч(ая|ее)|компан|доход|расход|транзакц|сч[её]т|клиент|договор|товар|продукт|склад|остаток|сотрудник|смен|уч[её]т времени|кассов|уведомлен|интеграц|настройк|профил)/iu,
  /(çalışma alan|şirket|gelir|gider|işlem|fatura|müşteri|sözleşme|ürün|envanter|stok|çalışan|vardiya|zaman takibi|kasa defteri|bildirim|entegrasyon|ayarlar|profil)/iu,
  /(робоч(а|ий)|компан|дохід|витрат|транзакц|рахунок|клієнт|договір|товар|продукт|склад|залишок|працівник|змін|облік часу|касов|сповіщенн|інтеграц|налаштуван|профіл)/iu,
  /(obszar roboczy|firma|przychód|wydatek|transakcj|faktur|klient|umow|produkt|magazyn|stan magazynowy|pracownik|zmian|ewidencj[aę] czasu|księga kasowa|powiadomien|integracj|ustawien|profil)/iu,
  /(espace de travail|entreprise|revenu|dépense|transaction|facture|client|contrat|produit|inventaire|stock|employé|équipe|suivi du temps|livre de caisse|notification|intégration|paramètres|profil)/iu,
]

const contextualInventoryPatterns = [
  /\b(item|quantity|amount|count|units?)\b/i,
  /\b(artikel|menge|anzahl|stückzahl)\b/iu,
  /\b(товар|количеств|штук)\b/iu,
  /\b(ürün|miktar|adet)\b/iu,
  /\b(товар|кількіст|штук)\b/iu,
  /\b(produkt|ilość|sztuk)\b/iu,
  /\b(produit|article|quantité|unités?)\b/iu,
]

const appActionPatterns = [
  /\b(add|change|edit|update|remove|delete|create|open|find|set|increase|decrease|adjust|how|where)\b/i,
  /\b(hinzufügen|ändern|wechseln|bearbeiten|löschen|erstellen|öffnen|finden|einstellen|erhöhen|verringern|wie|wo)\b/iu,
  /\b(добав|измен|редакт|удал|созда|откры|найти|настро|увелич|уменьш|как|где)\b/iu,
  /\b(ekle|değiştir|düzenle|sil|oluştur|aç|bul|ayarla|artır|azalt|nasıl|nerede)\b/iu,
  /\b(дод|змін|редаг|видал|створ|відкр|знай|налашт|збільш|зменш|як|де)\b/iu,
  /\b(dodaj|zmień|edytuj|usuń|utwórz|otwórz|znajdź|ustaw|zwiększ|zmniejsz|jak|gdzie)\b/iu,
  /\b(ajouter|changer|modifier|supprimer|créer|ouvrir|trouver|régler|augmenter|diminuer|comment|où)\b/iu,
]

// These are broad, high-confidence topic families, not an exhaustive blacklist.
const clearlyUnrelatedPatterns = [
  /\b(cook|recipe|pasta|pizza recipe|bake|random movie|film review|politics|president|election|porn|pornographic|sexual content|write (a )?(poem|song|story))\b/i,
  /\b(kochen|rezept|nudeln|zufälliger film|politik|präsident|wahl|porno|pornograf|sexuell|gedicht|lied)\b/iu,
  /\b(приготов|рецепт|макарон|случайн.*фильм|политик|президент|выбор|порно|сексуальн|стих|песн)\b/iu,
  /\b(yemek pişir|tarif|makarna|rastgele film|siyaset|başkan|seçim|porno|cinsel|şiir|şarkı)\b/iu,
  /\b(пригот|рецепт|макарон|випадков.*фільм|політик|президент|вибор|порно|сексуальн|вірш|пісн)\b/iu,
  /\b(gotować|przepis|makaron|losow.*film|polityk|prezydent|wybor|porno|seksual|wiersz|piosenk)\b/iu,
  /\b(cuisiner|recette|pâtes|film au hasard|politique|président|élection|porno|sexuel|poème|chanson)\b/iu,
]

const greetingPatterns = [
  /^(hi|hello|hey|good (morning|afternoon|evening))[!.\s]*$/i,
  /^(hallo|guten (morgen|tag|abend)|привет|здравствуйте|merhaba|selam|привіт|добрий день|cześć|dzień dobry|bonjour|salut)[!.\s]*$/iu,
]

const followUpPatterns = [
  /^(and|then|next|how|where|why|what about|can i|show me)\b/i,
  /^(und|dann|weiter|wie|wo|warum|а|и|тогда|дальше|как|где|почему|peki|sonra|nasıl|nerede|neden|тоді|далі|як|де|чому|a|następnie|dalej|jak|gdzie|dlaczego|et|ensuite|comment|où|pourquoi)\b/iu,
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

function isLeonetyScopedMessage(message: string) {
  const analysis = analyzeAssistantRequest(message)
  return analysis.tools.length > 0 || matchesAny(message, leonetyDomainPatterns)
}

function hasSafeAppRoute(pathname: string | null | undefined) {
  return typeof pathname === 'string' && /^\/app(?:\/|$)/.test(pathname)
}

function hasInventoryRoute(pathname: string | null | undefined) {
  return typeof pathname === 'string' && /^\/app\/(products|inventory|stock-movements)(?:\/|$)/.test(pathname)
}

export function classifyAssistantScope(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: AssistantScopeContext = {}
): AssistantRequestScope {
  const userMessages = messages.filter((message) => message.role === 'user')
  const current = userMessages.at(-1)?.content.trim().slice(0, 1800) ?? ''
  if (matchesAny(current, clearlyUnrelatedPatterns)) return 'OUT_OF_SCOPE'
  if (isLeonetyScopedMessage(current)) return 'IN_SCOPE'
  if (matchesAny(current, greetingPatterns)) return 'GREETING'

  const hasContextualAction = matchesAny(current, appActionPatterns)
  if (hasInventoryRoute(context.pathname) && hasContextualAction && matchesAny(current, contextualInventoryPatterns)) {
    return 'IN_SCOPE'
  }

  if (hasSafeAppRoute(context.pathname) && current.length <= 160 && matchesAny(current, followUpPatterns)) {
    return 'IN_SCOPE'
  }

  const isShortFollowUp = current.length <= 160 && matchesAny(current, followUpPatterns)
  if (isShortFollowUp && userMessages.slice(0, -1).some((message) => isLeonetyScopedMessage(message.content))) {
    return 'IN_SCOPE'
  }

  return 'UNCLEAR'
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
  if (code === 'quota_exhausted' || code === 'provider_quota_exhausted') return 'assistant.error.quota'
  if (code === 'configuration_missing' || code === 'provider_not_configured' || code === 'provider_unsupported') return 'assistant.error.configuration'
  if (code === 'provider_auth_failed') return 'assistant.error.providerAuth'
  if (code === 'invalid_model') return 'assistant.error.invalidModel'
  if (status === 504 || code === 'request_timeout' || code === 'provider_timeout') return 'assistant.error.timeout'
  if (status === 502 || code === 'invalid_response' || code === 'provider_invalid_response') return 'assistant.error.invalidResponse'
  if (status === 503 || code === 'provider_unavailable') return 'assistant.error.unavailable'
  if (code === 'internal_error') return 'assistant.error.internal'
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

const scopeResponses: Record<Locale, Record<Exclude<AssistantRequestScope, 'IN_SCOPE'>, string>> = {
  en: {
    GREETING: 'Hello! Ask me a question about Leonety or your authorized workspace data.',
    OUT_OF_SCOPE: "I didn't understand the question. Please ask another question about Leonety.",
    UNCLEAR: "I couldn't find that function in Leonety. Please clarify the question.",
  },
  de: {
    GREETING: 'Hallo! Stelle mir eine Frage zu Leonety oder zu deinen freigegebenen Workspace-Daten.',
    OUT_OF_SCOPE: 'Ich habe die Frage nicht verstanden. Bitte stelle eine andere Frage zu Leonety.',
    UNCLEAR: 'Ich konnte diese Funktion in Leonety nicht finden. Bitte präzisiere deine Frage.',
  },
  ru: {
    GREETING: 'Здравствуйте! Задайте вопрос о Leonety или доступных вам данных рабочего пространства.',
    OUT_OF_SCOPE: 'Я не понял вопрос. Пожалуйста, задайте другой вопрос о Leonety.',
    UNCLEAR: 'Я не смог найти такую функцию в Leonety. Пожалуйста, уточните вопрос.',
  },
  tr: {
    GREETING: 'Merhaba! Leonety veya erişiminiz olan çalışma alanı verileri hakkında bir soru sorun.',
    OUT_OF_SCOPE: 'Soruyu anlamadım. Lütfen Leonety hakkında başka bir soru sorun.',
    UNCLEAR: "Leonety'de bu işlevi bulamadım. Lütfen sorunuzu netleştirin.",
  },
  uk: {
    GREETING: 'Вітаю! Поставте запитання про Leonety або доступні вам дані робочого простору.',
    OUT_OF_SCOPE: 'Я не зрозумів запитання. Будь ласка, поставте інше запитання про Leonety.',
    UNCLEAR: 'Я не зміг знайти таку функцію в Leonety. Будь ласка, уточніть запитання.',
  },
  pl: {
    GREETING: 'Dzień dobry! Zapytaj o Leonety lub dane obszaru roboczego, do których masz dostęp.',
    OUT_OF_SCOPE: 'Nie rozumiem pytania. Zadaj inne pytanie dotyczące Leonety.',
    UNCLEAR: 'Nie udało mi się znaleźć tej funkcji w Leonety. Doprecyzuj pytanie.',
  },
  fr: {
    GREETING: 'Bonjour ! Posez une question sur Leonety ou sur les données autorisées de votre espace de travail.',
    OUT_OF_SCOPE: "Je n'ai pas compris la question. Posez une autre question concernant Leonety.",
    UNCLEAR: "Je n'ai pas trouvé cette fonction dans Leonety. Veuillez préciser la question.",
  },
}

export function getAssistantScopeResponse(locale: Locale, scope: Exclude<AssistantRequestScope, 'IN_SCOPE'>) {
  return scopeResponses[locale][scope]
}
