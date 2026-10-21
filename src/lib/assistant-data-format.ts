import type { Locale } from '@/lib/i18n'
import type { AssistantToolName } from '@/lib/assistant-context'

const localeMap: Record<Locale, string> = { en: 'en-US', de: 'de-DE', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA', pl: 'pl-PL', fr: 'fr-FR' }

const safeUnavailable: Record<Locale, string> = {
  en: "I can't verify that information from your current Leonety data.",
  de: 'Diese Information kann ich anhand deiner aktuellen Leonety-Daten nicht verifizieren.',
  ru: 'Я не могу проверить эту информацию по текущим данным Leonety.',
  tr: 'Bu bilgiyi mevcut Leonety verilerinizden doğrulayamıyorum.',
  uk: 'Я не можу перевірити цю інформацію за поточними даними Leonety.',
  pl: 'Nie mogę zweryfikować tej informacji na podstawie bieżących danych Leonety.',
  fr: 'Je ne peux pas vérifier cette information à partir de vos données Leonety actuelles.',
}

const unsupportedFeature: Record<Locale, string> = {
  en: "I can't verify that this feature exists in Leonety. I won't invent a route or setting.",
  de: 'Ich kann nicht verifizieren, dass diese Funktion in Leonety vorhanden ist, und erfinde keinen Menüpunkt.',
  ru: 'Я не могу подтвердить, что такая функция есть в Leonety, и не буду выдумывать раздел или настройку.',
  tr: 'Bu özelliğin Leonety içinde bulunduğunu doğrulayamıyorum; menü veya ayar uydurmayacağım.',
  uk: 'Я не можу підтвердити наявність цієї функції в Leonety й не вигадуватиму розділ або налаштування.',
  pl: 'Nie mogę potwierdzić, że ta funkcja istnieje w Leonety, i nie będę wymyślać ścieżki ani ustawienia.',
  fr: 'Je ne peux pas confirmer que cette fonctionnalité existe dans Leonety et je ne vais pas inventer de menu ni de réglage.',
}

const dataUnavailable: Record<Locale, string> = {
  en: "I couldn't retrieve the required Leonety data, so I can't give a factual answer. Please try again.",
  de: 'Die erforderlichen Leonety-Daten konnten nicht geladen werden. Deshalb kann ich keine verlässliche Antwort geben. Bitte versuche es erneut.',
  ru: 'Не удалось получить необходимые данные Leonety, поэтому я не могу дать достоверный ответ. Попробуйте снова.',
  tr: 'Gerekli Leonety verileri alınamadı; bu nedenle doğrulanmış bir yanıt veremiyorum. Lütfen tekrar deneyin.',
  uk: 'Не вдалося отримати потрібні дані Leonety, тому я не можу надати достовірну відповідь. Спробуйте ще раз.',
  pl: 'Nie udało się pobrać wymaganych danych Leonety, więc nie mogę podać wiarygodnej odpowiedzi. Spróbuj ponownie.',
  fr: 'Les données Leonety requises n’ont pas pu être récupérées ; je ne peux donc pas donner de réponse factuelle. Réessayez.',
}

const noWorkspace: Record<Locale, string> = {
  en: 'Select a workspace to check its Leonety data.',
  de: 'Wähle einen Workspace aus, um dessen Leonety-Daten zu prüfen.',
  ru: 'Выберите рабочее пространство, чтобы проверить его данные Leonety.',
  tr: 'Leonety verilerini kontrol etmek için bir çalışma alanı seçin.',
  uk: 'Виберіть робочий простір, щоб перевірити його дані Leonety.',
  pl: 'Wybierz obszar roboczy, aby sprawdzić jego dane Leonety.',
  fr: 'Sélectionnez un espace de travail pour vérifier ses données Leonety.',
}

const noData: Record<Locale, Record<string, string>> = {
  en: { income: 'No income records were found for this period.', expenses: 'No expense records were found for this period.', invoices: 'No issued unpaid invoices were found.', products: 'No products were found in this workspace.', stock: 'No active low-stock products were found.' },
  de: { income: 'Für diesen Zeitraum wurden keine Einnahmen gefunden.', expenses: 'Für diesen Zeitraum wurden keine Ausgaben gefunden.', invoices: 'Es wurden keine ausgestellten offenen Rechnungen gefunden.', products: 'In diesem Workspace wurden keine Produkte gefunden.', stock: 'Es wurden keine aktiven Produkte mit niedrigem Bestand gefunden.' },
  ru: { income: 'За этот период доходов не найдено.', expenses: 'За этот период расходов не найдено.', invoices: 'Не найдено выставленных неоплаченных счетов.', products: 'В этом рабочем пространстве товары не найдены.', stock: 'Активных товаров с низким остатком не найдено.' },
  tr: { income: 'Bu dönem için gelir kaydı bulunamadı.', expenses: 'Bu dönem için gider kaydı bulunamadı.', invoices: 'Ödenmemiş ve düzenlenmiş fatura bulunamadı.', products: 'Bu çalışma alanında ürün bulunamadı.', stock: 'Düşük stoklu etkin ürün bulunamadı.' },
  uk: { income: 'За цей період доходів не знайдено.', expenses: 'За цей період витрат не знайдено.', invoices: 'Виставлених неоплачених рахунків не знайдено.', products: 'У цьому робочому просторі товари не знайдено.', stock: 'Активних товарів із низьким залишком не знайдено.' },
  pl: { income: 'Nie znaleziono przychodów w tym okresie.', expenses: 'Nie znaleziono wydatków w tym okresie.', invoices: 'Nie znaleziono wystawionych, nieopłaconych faktur.', products: 'Nie znaleziono produktów w tym obszarze roboczym.', stock: 'Nie znaleziono aktywnych produktów z niskim stanem.' },
  fr: { income: 'Aucun revenu n’a été trouvé pour cette période.', expenses: 'Aucune dépense n’a été trouvée pour cette période.', invoices: 'Aucune facture émise et impayée n’a été trouvée.', products: 'Aucun produit n’a été trouvé dans cet espace de travail.', stock: 'Aucun produit actif à faible stock n’a été trouvé.' },
}

function clean(value: unknown, max = 120) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function currency(value: string, code: string, locale: Locale) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return `${value} ${code}`
  return new Intl.NumberFormat(localeMap[locale], { style: 'currency', currency: code }).format(amount)
}

export function getUnsupportedAssistantResponse(locale: Locale, reason: 'live_data' | 'feature') {
  return reason === 'feature' ? unsupportedFeature[locale] : safeUnavailable[locale]
}

export function getAssistantDataFailureResponse(locale: Locale, noWorkspaceSelected = false) {
  return noWorkspaceSelected ? noWorkspace[locale] : dataUnavailable[locale]
}

export function formatAssistantDataAnswer(locale: Locale, tool: AssistantToolName, data: Record<string, unknown>) {
  const empty = (key: string) => noData[locale][key]
  if (tool === 'current_workspace') {
    return `${clean(data.name) || 'Workspace'} · ${clean(data.type)} · ${clean(data.currency)}`
  }
  if (tool === 'account_plan') {
    const plan = clean(data.plan)
    const labels: Record<Locale, string> = { en: 'administrator access', de: 'Administratorzugriff', ru: 'доступ администратора', tr: 'yönetici erişimi', uk: 'доступ адміністратора', pl: 'dostęp administratora', fr: 'accès administrateur' }
    return `${plan}${data.isAdmin === true ? ` (${labels[locale]})` : ''}`
  }
  if (tool === 'woocommerce_status') {
    const labels: Record<Locale, Record<string, string>> = {
      en: { connected: 'Connected', not_connected: 'Not connected', error: 'Error', disabled: 'Disabled', reconnect_required: 'Reconnect required' },
      de: { connected: 'Verbunden', not_connected: 'Nicht verbunden', error: 'Fehler', disabled: 'Deaktiviert', reconnect_required: 'Erneute Verbindung erforderlich' },
      ru: { connected: 'Подключено', not_connected: 'Не подключено', error: 'Ошибка', disabled: 'Отключено', reconnect_required: 'Требуется переподключение' },
      tr: { connected: 'Bağlı', not_connected: 'Bağlı değil', error: 'Hata', disabled: 'Devre dışı', reconnect_required: 'Yeniden bağlanma gerekli' },
      uk: { connected: 'Підключено', not_connected: 'Не підключено', error: 'Помилка', disabled: 'Вимкнено', reconnect_required: 'Потрібне повторне підключення' },
      pl: { connected: 'Połączono', not_connected: 'Nie połączono', error: 'Błąd', disabled: 'Wyłączono', reconnect_required: 'Wymagane ponowne połączenie' },
      fr: { connected: 'Connecté', not_connected: 'Non connecté', error: 'Erreur', disabled: 'Désactivé', reconnect_required: 'Reconnexion requise' },
    }
    return labels[locale][String(data.status)] ?? safeUnavailable[locale]
  }
  if (tool === 'product_count') {
    const count = Number(data.count)
    const productCount: Record<Locale, (value: number) => string> = {
      en: (value) => `${value} ${value === 1 ? 'product' : 'products'}`, de: (value) => `${value} ${value === 1 ? 'Produkt' : 'Produkte'}`,
      ru: (value) => `${value} товаров`, tr: (value) => `${value} ürün`, uk: (value) => `${value} товарів`,
      pl: (value) => `${value} produktów`, fr: (value) => `${value} ${value === 1 ? 'produit' : 'produits'}`,
    }
    return count === 0 ? empty('products') : productCount[locale](count)
  }
  if (tool === 'income_summary' || tool === 'expense_summary') {
    const count = Number(data.count)
    if (count === 0) return empty(tool === 'income_summary' ? 'income' : 'expenses')
    if (data.complete !== true || typeof data.amount !== 'string') {
      const missing = Number(data.unconvertedCount ?? 0)
      const incomplete: Record<Locale, string> = {
        en: `${missing} records lack a verified currency-conversion snapshot; the total is incomplete.`,
        de: `${missing} Datensätze haben keinen verifizierten Währungsumrechnungssnapshot; die Summe ist unvollständig.`,
        ru: `${missing} записей не имеют подтверждённого снимка конвертации валюты; итог неполный.`,
        tr: `${missing} kayıtta doğrulanmış para birimi dönüşüm anlık görüntüsü yok; toplam eksik.`,
        uk: `${missing} записів не мають підтвердженого знімка конвертації валюти; підсумок неповний.`,
        pl: `${missing} rekordów nie ma potwierdzonego zapisu przeliczenia waluty; suma jest niepełna.`,
        fr: `${missing} enregistrements n’ont pas de conversion de devise vérifiée ; le total est incomplet.`,
      }
      return incomplete[locale]
    }
    const period = data.period && typeof data.period === 'object' ? data.period as { from?: string; to?: string } : {}
    return `${currency(data.amount, String(data.currency), locale)} · ${count} records (${clean(period.from)}–${clean(period.to)})`
  }
  if (tool === 'unpaid_invoice_summary') {
    const invoices = Array.isArray(data.invoices) ? data.invoices as Array<Record<string, unknown>> : []
    const count = Number(data.count)
    if (count === 0) return empty('invoices')
    const lines = invoices.map((invoice) => {
      const reference = clean(invoice.invoiceNumber) || clean(invoice.id, 48)
      const customer = clean(invoice.customer) || (locale === 'de' ? 'Kein Kunde verknüpft' : 'No linked customer')
      const statusLabels: Record<Locale, Record<string, string>> = {
        en: { sent: 'Issued', overdue: 'Overdue' }, de: { sent: 'Ausgestellt', overdue: 'Überfällig' },
        ru: { sent: 'Выставлен', overdue: 'Просрочен' }, tr: { sent: 'Düzenlendi', overdue: 'Vadesi geçti' },
        uk: { sent: 'Виставлений', overdue: 'Прострочений' }, pl: { sent: 'Wystawiona', overdue: 'Po terminie' },
        fr: { sent: 'Émise', overdue: 'En retard' },
      }
      return `${reference} · ${customer} · ${statusLabels[locale][String(invoice.status)] ?? clean(invoice.status)} · ${currency(String(invoice.outstanding), String(invoice.currency), locale)}`
    })
    const suffix = count > invoices.length ? `\n${count - invoices.length} more invoices not shown.` : ''
    return lines.join('\n') + suffix
  }
  if (tool === 'low_stock_products') {
    const products = Array.isArray(data.products) ? data.products as Array<Record<string, unknown>> : []
    const count = Number(data.count)
    if (count === 0) return empty('stock')
    const heading: Record<Locale, string> = {
      en: `${count} active low-stock products${count > products.length ? ` (showing ${products.length})` : ''}:`,
      de: `${count} aktive Produkte mit niedrigem Bestand${count > products.length ? ` (angezeigt: ${products.length})` : ''}:`,
      ru: `Активных товаров с низким остатком: ${count}${count > products.length ? ` (показано ${products.length})` : ''}:`,
      tr: `Düşük stoklu etkin ürün: ${count}${count > products.length ? ` (gösterilen ${products.length})` : ''}:`,
      uk: `Активних товарів із низьким залишком: ${count}${count > products.length ? ` (показано ${products.length})` : ''}:`,
      pl: `Aktywne produkty z niskim stanem: ${count}${count > products.length ? ` (pokazano ${products.length})` : ''}:`,
      fr: `${count} produits actifs à faible stock${count > products.length ? ` ( ${products.length} affichés)` : ''} :`,
    }
    return `${heading[locale]}\n${products.map((product) => `${clean(product.name)}${product.sku ? ` (${clean(product.sku, 40)})` : ''}: ${clean(String(product.currentStock))} / ${clean(String(product.lowStockThreshold))}`).join('\n')}`
  }
  return safeUnavailable[locale]
}
