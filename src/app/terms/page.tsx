'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'

const content = {
  en: {
    title: 'Terms of Service',
    intro: 'These Terms govern access to Leonety, an MVP SaaS product for bookkeeping, clients, invoices, and time tracking.',
    sections: [
      ['Use of the Service', 'You may use Leonety only for lawful business or personal productivity purposes. You are responsible for the accuracy of the data you enter.'],
      ['Accounts and Workspaces', 'Users can create and manage workspaces subject to plan limits. Workspace owners are responsible for records and activity inside their workspaces.'],
      ['Plans and Access', 'Free and Pro features may differ. During the MVP phase, Pro access may be manually reviewed and activated by an administrator.'],
      ['No Professional Advice', 'Leonety helps organize records, but does not provide tax, legal, accounting, or financial advice.'],
      ['Liability', 'Leonety is provided as an evolving MVP without guarantees of uninterrupted availability, error-free operation, or specific business outcomes.'],
    ],
  },
  de: {
    title: 'Nutzungsbedingungen',
    intro: 'Diese Bedingungen regeln den Zugang zu Leonety, einem MVP-SaaS für Buchhaltung, Kunden, Rechnungen und Zeiterfassung.',
    sections: [
      ['Nutzung des Dienstes', 'Sie dürfen Leonety nur für rechtmäßige geschäftliche oder persönliche Produktivitätszwecke nutzen. Sie sind für die Richtigkeit Ihrer Eingaben verantwortlich.'],
      ['Konten und Arbeitsbereiche', 'Nutzer können Arbeitsbereiche gemäß Planlimits erstellen und verwalten. Eigentümer sind für Einträge und Aktivitäten verantwortlich.'],
      ['Pläne und Zugriff', 'Free- und Pro-Funktionen können sich unterscheiden. In der MVP-Phase kann Pro-Zugriff manuell geprüft und aktiviert werden.'],
      ['Keine professionelle Beratung', 'Leonety hilft beim Organisieren von Daten, bietet aber keine Steuer-, Rechts-, Buchhaltungs- oder Finanzberatung.'],
      ['Haftung', 'Leonety wird als sich entwickelndes MVP ohne Garantie für ununterbrochene Verfügbarkeit, Fehlerfreiheit oder bestimmte Geschäftsergebnisse bereitgestellt.'],
    ],
  },
  ru: {
    title: 'Условия использования',
    intro: 'Эти условия регулируют доступ к Leonety, MVP SaaS для учёта, клиентов, счетов и времени.',
    sections: [
      ['Использование сервиса', 'Вы можете использовать Leonety только для законных рабочих или личных целей. Вы отвечаете за точность введённых данных.'],
      ['Аккаунты и workspace', 'Пользователи могут создавать и управлять workspace в рамках лимитов плана. Владелец отвечает за записи и действия внутри workspace.'],
      ['Планы и доступ', 'Функции Free и Pro могут отличаться. На этапе MVP Pro-доступ может проверяться и активироваться администратором вручную.'],
      ['Не является профессиональной консультацией', 'Leonety помогает организовывать данные, но не предоставляет налоговые, юридические, бухгалтерские или финансовые консультации.'],
      ['Ответственность', 'Leonety предоставляется как развивающийся MVP без гарантий непрерывной доступности, отсутствия ошибок или конкретных бизнес-результатов.'],
    ],
  },
}

export default function TermsPage() {
  const { locale } = useI18n()
  const page = content[locale]

  return <LegalPage title={page.title} intro={<p>{page.intro}</p>} sections={page.sections.map(([title, text]) => ({ title, content: <p>{text}</p> }))} />
}
