'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'
import { getContactEmail } from '@/lib/contact'

const content = {
  en: {
    title: 'Impressum',
    intro: 'Basic provider information structure for Germany/EU-facing services. Complete missing business details before public launch.',
    provider: 'Provider name, address, country, registration number, VAT ID, and supervisory authority should be added only when confirmed.',
    responsibility: 'The provider is responsible for its own content according to applicable law. User-entered workspace data remains the responsibility of the user.',
  },
  de: {
    title: 'Impressum',
    intro: 'Grundstruktur für Anbieterinformationen bei Deutschland/EU-orientierten Diensten. Fehlende Geschäftsdaten vor dem öffentlichen Start ergänzen.',
    provider: 'Anbietername, Adresse, Land, Registernummer, USt-IdNr. und Aufsichtsbehörde sollten nur ergänzt werden, wenn sie bestätigt sind.',
    responsibility: 'Der Anbieter ist nach geltendem Recht für eigene Inhalte verantwortlich. Vom Nutzer eingegebene Arbeitsbereichsdaten bleiben Verantwortung des Nutzers.',
  },
  ru: {
    title: 'Импрессум',
    intro: 'Базовая структура данных провайдера для сервисов, ориентированных на Германию/ЕС. Недостающие бизнес-данные нужно заполнить до публичного запуска.',
    provider: 'Имя провайдера, адрес, страна, регистрационный номер, VAT ID и надзорный орган нужно добавлять только после подтверждения.',
    responsibility: 'Провайдер отвечает за собственный контент согласно применимому праву. Данные workspace, введённые пользователем, остаются ответственностью пользователя.',
  },
}

export default function ImpressumPage() {
  const { locale, t } = useI18n()
  const contactEmail = getContactEmail()
  const page = content[locale as keyof typeof content] ?? content.en

  return (
    <LegalPage
      title={page.title}
      intro={<p>{page.intro}</p>}
      sections={[
        { title: 'Leonety', content: <p>{page.provider}</p> },
        { title: 'Contact', content: contactEmail ? <a className="font-medium text-slate-900 underline" href={`mailto:${contactEmail}`}>{contactEmail}</a> : <p>{t('legal.toBeAdded')}</p> },
        { title: 'Responsibility', content: <p>{page.responsibility}</p> },
      ]}
    />
  )
}
