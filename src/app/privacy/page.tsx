'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'
import { getContactEmail } from '@/lib/contact'

const content = {
  en: {
    title: 'Privacy Policy',
    intro: 'This Privacy Policy explains how Leonety handles personal data for accounts, workspaces, bookkeeping, clients, invoices, time tracking, support, and security.',
    sections: [
      ['Contact', 'For privacy questions or data requests, contact the service operator.'],
      ['Data We Process', 'We process account data, profile data, workspace data, income and expense records, time entries, client records, invoice records, settings, and technical security information.'],
      ['Why We Process Data', 'Data is processed to provide the app, authenticate users, secure accounts, save records, manage workspaces, provide support, and comply with legal obligations.'],
      ['Supabase and Infrastructure', 'Leonety uses Supabase for authentication, database services, and backend infrastructure. Supabase may process authentication metadata, database records, logs, and security information needed to operate the service.'],
      ['Your Rights', 'Depending on your location, you may have rights to access, correct, delete, restrict, object to processing, or request portability of your personal data.'],
    ],
  },
  de: {
    title: 'Datenschutzerklärung',
    intro: 'Diese Datenschutzerklärung erklärt, wie Leonety personenbezogene Daten für Konten, Arbeitsbereiche, Buchhaltung, Kunden, Rechnungen, Zeiterfassung, Support und Sicherheit verarbeitet.',
    sections: [
      ['Kontakt', 'Bei Datenschutzfragen oder Datenanfragen kontaktieren Sie den Betreiber des Dienstes.'],
      ['Verarbeitete Daten', 'Wir verarbeiten Kontodaten, Profildaten, Arbeitsbereichsdaten, Einnahmen und Ausgaben, Zeiteinträge, Kundendaten, Rechnungen, Einstellungen und technische Sicherheitsinformationen.'],
      ['Zwecke der Verarbeitung', 'Daten werden verarbeitet, um die App bereitzustellen, Nutzer zu authentifizieren, Konten zu schützen, Einträge zu speichern, Arbeitsbereiche zu verwalten, Support zu leisten und rechtliche Pflichten zu erfüllen.'],
      ['Supabase und Infrastruktur', 'Leonety nutzt Supabase für Authentifizierung, Datenbankdienste und Backend-Infrastruktur. Supabase kann Authentifizierungsmetadaten, Datenbankeinträge, Logs und Sicherheitsinformationen verarbeiten.'],
      ['Ihre Rechte', 'Je nach Standort können Sie Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch oder Datenübertragbarkeit haben.'],
    ],
  },
  ru: {
    title: 'Политика конфиденциальности',
    intro: 'Эта политика объясняет, как Leonety обрабатывает персональные данные для аккаунтов, workspace, учёта, клиентов, счетов, времени, поддержки и безопасности.',
    sections: [
      ['Контакт', 'По вопросам конфиденциальности или запросам данных свяжитесь с оператором сервиса.'],
      ['Какие данные обрабатываются', 'Мы обрабатываем данные аккаунта, профиля, workspace, доходы и расходы, записи времени, клиентов, счета, настройки и техническую информацию безопасности.'],
      ['Зачем обрабатываются данные', 'Данные нужны для работы приложения, входа, защиты аккаунтов, сохранения записей, управления workspace, поддержки и выполнения юридических обязанностей.'],
      ['Supabase и инфраструктура', 'Leonety использует Supabase для авторизации, базы данных и backend-инфраструктуры. Supabase может обрабатывать метаданные авторизации, записи базы данных, логи и данные безопасности.'],
      ['Ваши права', 'В зависимости от страны вы можете иметь права на доступ, исправление, удаление, ограничение, возражение против обработки или перенос данных.'],
    ],
  },
}

export default function PrivacyPage() {
  const { locale } = useI18n()
  const contactEmail = getContactEmail()
  const page = content[locale]

  return (
    <LegalPage
      title={page.title}
      intro={<p>{page.intro}</p>}
      sections={[
        ...page.sections.map(([title, text]) => ({ title, content: <p>{text}</p> })),
        {
          title: 'Email',
          content: contactEmail ? <a className="font-medium text-slate-900 underline" href={`mailto:${contactEmail}`}>{contactEmail}</a> : <p>Contact email is configured by the service operator.</p>,
        },
      ]}
    />
  )
}
