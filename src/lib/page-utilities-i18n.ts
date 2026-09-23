const dictionaries = {
  en: 'Import / Export',
  de: 'Import / Export',
  ru: 'Импорт / экспорт',
  tr: 'İçe / dışa aktarma',
  uk: 'Імпорт / експорт',
  pl: 'Import / eksport',
  fr: 'Import / export',
} as const

export const pageUtilitiesDictionaries = Object.fromEntries(
  Object.entries(dictionaries).map(([locale, title]) => [locale, { 'pageUtilities.title': title }])
) as Record<keyof typeof dictionaries, { 'pageUtilities.title': string }>
