// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { analyzeAssistantRequest, type AssistantToolName } from './assistant-context.ts'

export type AssistantCapabilityDecision =
  | { kind: 'data'; tools: AssistantToolName[]; sourceMessage: string }
  | { kind: 'unsupported'; reason: 'live_data' | 'feature'; sourceMessage: string }
  | { kind: 'conversation'; sourceMessage: string }

const followUpPattern = /^(?:is that correct|is that right|what about now|and now|how many exactly|how much exactly|and\s+.+|what about\s+.+|still\??)[?.!\s]*$/i
const productCountPattern = /\b(how many|count|number of|exactly how many)\b.{0,60}\b(products?|items?)\b|\b(products?|items?)\b.{0,60}\b(count|total|how many|number)\b|(?:wie viele|anzahl|сколько|kaç tane|ile jest|combien).{0,45}(?:produkte|artikel|товар|продукт|ürün|produkty|produits?)/iu
const qualifiedProductCountPattern = /\b(active|inactive|archived|discontinued|in stock|available|out of stock|low stock|below minimum|running out)\b|\b(aktive|inaktive|archivierte|auf lager|verfügbar|mindestbestand)\b|(?:активн|неактивн|архивн|в наличии|доступн|нет в наличии|мало на складе|ниже минимума)|(?:aktif|pasif|arşiv|stokta|mevcut|stokta yok|düşük stok|minimumun altında)|(?:активн|неактивн|архів|у наявності|доступн|немає в наявності|мало на складі|нижче мінімуму)|(?:aktywn|nieaktywn|zarchiwiz|w magazynie|dostępn|brak w magazynie|niski stan|poniżej minimum)|(?:actif|inactive|archivé|en stock|disponible|rupture de stock|stock faible|sous le minimum)/iu
const planPattern = /\b(my|current|active|which|what|subscription|plan|tier|welche|welcher|mein|aktuell|мой|текущ|benim|mevcut|hangi|mój|bieżąc|mon|actuel|який|поточн)\b.{0,50}\b(plan|subscription|tier|abo|abonnement|tarif|тариф|план|abonelik|paket|підписк|subskrypcj|forfait)\b|\b(plan|subscription|tier|abo|abonnement|tarif|тариф|план|abonelik|paket|підписк|subskrypcj|forfait)\b.{0,50}\b(current|active|mein|мой|benim|mój|mon|aktuell|текущ|поточн|mevcut|bieżąc|actuel)\b/iu
const wooPattern = /\bwoocommerce\b|\bwoo\s*commerce\b|\b(woocommerce|woocommerce|woo)\b/iu
const liveFactPattern = /(?:balance|profit|tax|cashbook|kassenbuch|saldo|gewinn|steuer|кассов|баланс|прибыл|налог|kâr|bakiye|vergi|залиш|прибут|подат|zysk|solde|bénéfice|impôt)|(?:\b(how much|how many|count|exactly|current|currently|right now|my total|total|what is my|which|list|show me|do i have|are there|is .* connected)\b.{0,70}\b(stock|inventory|subscription|plan|unpaid|overdue|invoice|income|expenses?|revenue|products?|clients?|employees?|integrations?|woocommerce)\b)|(?:\b(wie viel|wie viele|genau|aktuell|habe ich|welche|zeige|anzahl)\b.{0,70}\b(bestand|lager|tarif|abo|unbezahlt|überfällig|rechnung|einnahmen|ausgaben|produkt|kunde|mitarbeiter|integration)\b)|(?:сколько|точно|сейчас|какой|какие|покажи|есть ли).{0,70}(остат|склад|тариф|подписк|неоплачен|счет|доход|расход|товар|клиент|сотрудник|интеграц)|(?:\b(ne kadar|kaç tane|şu an|hangi|göster|var mı)\b.{0,70}\b(stok|abonelik|fatura|gelir|gider|ürün|müşteri|çalışan|entegrasyon)\b)|(?:скільки|точно|зараз|який|які|покажи|чи є).{0,70}(залиш|склад|тариф|підписк|рахунок|дохід|витрат|товар|клієнт|працівник|інтеграц)|(?:\b(combien|exactement|actuel|quel|quels|montre|y a-t-il)\b.{0,70}\b(stock|abonnement|facture|revenu|dépense|produit|client|employé|intégration)\b)|^(?:and|what about|und|а|и|тогда|а що щодо|et|i|a)\s+(?:invoices?|products?|income|expenses?|clients?|employees?|stock|inventory|plan|subscription|balance|клиент|товар|счет|рахунок|продукт|produkt|rechnung|facture)\b/iu
const featureQuestionPattern = /\b(does leonety|is there|do you have|does it support|where can i configure|where do i configure|can i enable|is .* available|how do i (configure|enable|set up|activate)|where do i (configure|enable|set up|activate))\b|\b(gibt es|unterstützt leonety|wo kann ich .* konfigurieren|kann ich .* aktivieren)\b|\b(есть ли|поддерживает ли|где настроить|можно ли включить)\b|\b(var mı|destekliyor mu|nereden yapılandır|etkinleştirebilir miyim)\b|\b(чи є|чи підтримує|де налаштувати|чи можна ввімкнути)\b|\b(czy jest|czy leonety obsługuje|gdzie skonfigurować|czy mogę włączyć)\b|\b(est-ce que|où configurer|puis-je activer)\b/iu
const allowedFeatureWords = new Set((
  'does leonety support have feature is there do you it available where can i configure enable set up use find how to the a an my me your currently in which for at on and or of with create add edit connect import export mapping status account online offline external sync print view manual automatic web push invoice invoices product products category categories employee employees schedule mail email integration integrations notification notifications client clients contract contracts transaction transactions income expense expenses workspace settings woocommerce kassenbuch cashbook assistant ai business data plan subscription tariff template templates inventory stock einstellungen arbeitsbereich unternehmen rechnung rechnungen produkt produkte mitarbeiter kunden vertrag verträge einnahmen ausgaben abonnement tarif configurieren aktivieren erstellen hinzufügen modifier ändern bearbeiten verbinden konfiguration verwalten wo welche welcher mein meine aktueller gibt unterstützt kann ich der die das ist verfügbar ein eine können wir was wie настройка настройку настроить включить есть поддерживает можно ли где какой какая какие мой моя текущий текущая план тариф подписка счет счета товар товары продукт продукты сотрудник сотрудники клиент клиенты доход расходы настройки рабочее пространство интеграция почта уведомление yapılandır ayarlar ayarı var destekliyor mu hangi benim mevcut fatura faturalar ürün ürünler çalışan çalışanlar müşteri gelir gider abonelik plan ayarları gdzie czy obsługuje ustawić włączyć faktura faktury produkt produkty pracownik pracownicy klient przychód wydatek ustawienia francais facture factures produit produits employé employés client revenu dépense abonnement paramètres où est-ce que puis-je configurer activer' 
).toLowerCase().split(/\s+/))
const unsupportedPeriodPattern = /\b(last|previous|past|yesterday|last week|last month|last year|this week|this quarter|between|from .+ to|in (january|february|march|april|may|june|july|august|september|october|november|december)|quarter|month-to-date before)\b|\b(letzten?|vorigen?|vergangenen?|gestern|letzte woche|letzten monat|letztes jahr|zwischen|von .+ bis|im januar|im februar|im märz|im april|im mai|im juni|im juli|im august|im september|im oktober|im november|im dezember)\b|(?:прошл\w*|вчера|на прошлой неделе|в прошлом месяце|в прошлом году|между|с .+ по .+|за квартал|в январе|в феврале|в марте|в апреле|в мае|в июне|в июле|в августе|в сентябре|в октябре|в ноябре|в декабре)|(?:geçen|dün|önceki hafta|önceki ay|önceki yıl|arasında|çeyrek|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)|(?:минулий|вчора|минулого місяця|минулого року|між|квартал|у січні|у лютому|у березні|у квітні|у травні|у червні|у липні|у серпні|у вересні|у жовтні|у листопаді|у грудні)|(?:zeszł\w*|wczoraj|między|kwartał|w styczniu|w lutym|w marcu|w kwietniu|w maju|w czerwcu|w lipcu|w sierpniu|we wrześniu|w październiku|w listopadzie|w grudniu)|(?:dernier|dernière|hier|la semaine dernière|le mois dernier|l'année dernière|entre|trimestre|en janvier|en février|en mars|en avril|en mai|en juin|en juillet|en août|en septembre|en octobre|en novembre|en décembre)/iu
const unsupportedRecordQueryPattern = /\b(show|list|display|find|which|all|every)\b.{0,50}\b(invoices?|transactions?|clients?|employees?|products?|expenses?|income|records?)\b|\b(status|state)\b.{0,40}\b(invoices?|transactions?|clients?|products?|integrations?|woo)\b|\b(invoices?|transactions?|clients?|products?)\b.{0,40}\b(status|state|list|records?)\b/iu

function explicitTool(message: string): AssistantToolName[] {
  if (productCountPattern.test(message)) return ['product_count']
  if (planPattern.test(message)) return ['account_plan']
  if (wooPattern.test(message) && /\?|\b(and|what about|connected|connection|sync|status|verbunden|подключ|bağlı|połącz|connecté)\b/iu.test(message)) return ['woocommerce_status']
  return analyzeAssistantRequest(message).tools
}

function isUnsupportedFeatureQuestion(message: string) {
  if (!featureQuestionPattern.test(message)) return false
  const tokens = message.toLowerCase().match(/\p{L}+/gu) ?? []
  return tokens.some((token) => !allowedFeatureWords.has(token))
}

function classifyExplicitMessage(message: string): AssistantCapabilityDecision {
  if (productCountPattern.test(message) && qualifiedProductCountPattern.test(message)) {
    return { kind: 'unsupported', reason: 'live_data', sourceMessage: message }
  }
  const tools = explicitTool(message)
  if (tools.length > 0) {
    const unsupportedPeriod = tools.some((tool) =>
      (tool === 'income_summary' || tool === 'expense_summary') && unsupportedPeriodPattern.test(message)
    )
    if (unsupportedPeriod) return { kind: 'unsupported', reason: 'live_data', sourceMessage: message }
    return { kind: 'data', tools, sourceMessage: message }
  }
  if (isUnsupportedFeatureQuestion(message)) return { kind: 'unsupported', reason: 'feature', sourceMessage: message }
  if (liveFactPattern.test(message)) return { kind: 'unsupported', reason: 'live_data', sourceMessage: message }
  return { kind: 'conversation', sourceMessage: message }
}

export function resolveAssistantCapability(messages: Array<{ role: 'user' | 'assistant'; content: string }>): AssistantCapabilityDecision {
  const userMessages = messages.filter((message) => message.role === 'user')
  const current = userMessages.at(-1)?.content.trim().slice(0, 1800) ?? ''
  const currentAnalysis = analyzeAssistantRequest(current)
  if (currentAnalysis.blockedReason) return { kind: 'conversation', sourceMessage: current }

  const currentDecision = classifyExplicitMessage(current)
  if (currentDecision.kind !== 'conversation') return currentDecision
  if (unsupportedRecordQueryPattern.test(current)) return { kind: 'unsupported', reason: 'live_data', sourceMessage: current }
  if (followUpPattern.test(current)) {
    const priorDecision = userMessages.slice(0, -1).reverse()
      .map((message) => classifyExplicitMessage(message.content))
      .find((decision) => decision.kind !== 'conversation')
    if (priorDecision) return priorDecision
  }
  return currentDecision
}
