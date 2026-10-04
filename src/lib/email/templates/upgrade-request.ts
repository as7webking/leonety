import { getIntlLocale, normalizeLocale, type Locale } from '@/lib/i18n'

interface UpgradeRequestTemplateInput {
  locale: Locale
  productName: string
  appUrl: string
  requesterEmail: string
  companyName: string
  requestedPlan: string
  createdAt: string
  message: string | null
}

const copy: Record<Locale, {
  subject: string
  heading: string
  intro: string
  requester: string
  workspace: string
  plan: string
  created: string
  message: string
  action: string
  noMessage: string
}> = {
  en: { subject: 'New Pro upgrade request', heading: 'New upgrade request', intro: 'A Leonety user requested a plan upgrade.', requester: 'Requester', workspace: 'Workspace', plan: 'Requested plan', created: 'Created', message: 'Message', action: 'Review request', noMessage: 'No additional message.' },
  de: { subject: 'Neue Pro-Upgrade-Anfrage', heading: 'Neue Upgrade-Anfrage', intro: 'Ein Leonety-Nutzer hat ein Plan-Upgrade angefragt.', requester: 'Anfragende Person', workspace: 'Arbeitsbereich', plan: 'Gewünschter Plan', created: 'Erstellt', message: 'Nachricht', action: 'Anfrage prüfen', noMessage: 'Keine zusätzliche Nachricht.' },
  ru: { subject: 'Новый запрос на переход на Pro', heading: 'Новый запрос на повышение тарифа', intro: 'Пользователь Leonety запросил повышение тарифа.', requester: 'Пользователь', workspace: 'Workspace', plan: 'Запрошенный тариф', created: 'Создано', message: 'Сообщение', action: 'Проверить запрос', noMessage: 'Дополнительного сообщения нет.' },
  tr: { subject: 'Yeni Pro yükseltme isteği', heading: 'Yeni yükseltme isteği', intro: 'Bir Leonety kullanıcısı plan yükseltmesi istedi.', requester: 'İstekte bulunan', workspace: 'Çalışma alanı', plan: 'İstenen plan', created: 'Oluşturulma', message: 'Mesaj', action: 'İsteği incele', noMessage: 'Ek mesaj yok.' },
  uk: { subject: 'Новий запит на перехід на Pro', heading: 'Новий запит на підвищення тарифу', intro: 'Користувач Leonety запросив підвищення тарифу.', requester: 'Користувач', workspace: 'Робочий простір', plan: 'Запитаний тариф', created: 'Створено', message: 'Повідомлення', action: 'Переглянути запит', noMessage: 'Додаткового повідомлення немає.' },
  pl: { subject: 'Nowa prośba o przejście na Pro', heading: 'Nowa prośba o zmianę planu', intro: 'Użytkownik Leonety poprosił o zmianę planu.', requester: 'Użytkownik', workspace: 'Obszar roboczy', plan: 'Wybrany plan', created: 'Utworzono', message: 'Wiadomość', action: 'Sprawdź prośbę', noMessage: 'Brak dodatkowej wiadomości.' },
  fr: { subject: 'Nouvelle demande de passage à Pro', heading: 'Nouvelle demande de changement de forfait', intro: 'Un utilisateur Leonety a demandé un changement de forfait.', requester: 'Demandeur', workspace: 'Espace de travail', plan: 'Forfait demandé', created: 'Créée le', message: 'Message', action: 'Examiner la demande', noMessage: 'Aucun message supplémentaire.' },
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function buildUpgradeRequestEmail(input: UpgradeRequestTemplateInput) {
  const locale = normalizeLocale(input.locale)
  const labels = copy[locale]
  const date = new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(input.createdAt))
  const reviewUrl = `${input.appUrl.replace(/\/+$/, '')}/app/profile`
  const rawMessage = input.message?.trim() || labels.noMessage
  const rows = [
    [labels.requester, input.requesterEmail],
    [labels.workspace, input.companyName],
    [labels.plan, input.requestedPlan],
    [labels.created, date],
    [labels.message, rawMessage],
  ]

  const text = [
    labels.heading,
    '',
    labels.intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `${labels.action}: ${reviewUrl}`,
  ].join('\n')

  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <th style="padding:8px 12px;text-align:left;vertical-align:top;color:#475569;font-weight:600">${escapeHtml(label)}</th>
      <td style="padding:8px 12px;color:#0f172a;white-space:pre-wrap">${escapeHtml(value)}</td>
    </tr>`).join('')

  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;padding:28px">
        <p style="margin:0 0 8px;color:#64748b;font-size:14px">${escapeHtml(input.productName)}</p>
        <h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(labels.heading)}</h1>
        <p style="margin:0 0 20px;color:#334155">${escapeHtml(labels.intro)}</p>
        <table role="presentation" style="width:100%;border-collapse:collapse">${htmlRows}</table>
        <p style="margin:24px 0 0"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:11px 16px">${escapeHtml(labels.action)}</a></p>
      </div>
    </div>
  </body>
</html>`

  return { subject: `${input.productName}: ${labels.subject}`, html, text }
}

export const upgradeRequestEmailLocales = Object.keys(copy) as Locale[]
