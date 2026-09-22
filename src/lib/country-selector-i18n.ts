const en = {
  selectCountry: 'Select country', selectNationality: 'Select nationality', searchCountry: 'Search countries',
  searchNationality: 'Search nationalities', noResults: 'No matching country found.', other: 'Other',
  specifyCountry: 'Specify country', specifyNationality: 'Specify nationality', notSpecified: 'Not specified',
}
const de: typeof en = { selectCountry:'Land auswählen',selectNationality:'Staatsangehörigkeit auswählen',searchCountry:'Länder suchen',searchNationality:'Staatsangehörigkeit suchen',noResults:'Kein passendes Land gefunden.',other:'Sonstiges',specifyCountry:'Land angeben',specifyNationality:'Staatsangehörigkeit angeben',notSpecified:'Nicht angegeben' }
const ru: typeof en = { selectCountry:'Выберите страну',selectNationality:'Выберите гражданство',searchCountry:'Поиск страны',searchNationality:'Поиск гражданства',noResults:'Подходящая страна не найдена.',other:'Другое',specifyCountry:'Укажите страну',specifyNationality:'Укажите гражданство',notSpecified:'Не указано' }
const tr: typeof en = { selectCountry:'Ülke seçin',selectNationality:'Uyruk seçin',searchCountry:'Ülke ara',searchNationality:'Uyruk ara',noResults:'Eşleşen ülke bulunamadı.',other:'Diğer',specifyCountry:'Ülkeyi belirtin',specifyNationality:'Uyruğu belirtin',notSpecified:'Belirtilmedi' }
const uk: typeof en = { selectCountry:'Виберіть країну',selectNationality:'Виберіть громадянство',searchCountry:'Пошук країни',searchNationality:'Пошук громадянства',noResults:'Відповідної країни не знайдено.',other:'Інше',specifyCountry:'Укажіть країну',specifyNationality:'Укажіть громадянство',notSpecified:'Не вказано' }
const pl: typeof en = { selectCountry:'Wybierz kraj',selectNationality:'Wybierz obywatelstwo',searchCountry:'Szukaj kraju',searchNationality:'Szukaj obywatelstwa',noResults:'Nie znaleziono pasującego kraju.',other:'Inne',specifyCountry:'Podaj kraj',specifyNationality:'Podaj obywatelstwo',notSpecified:'Nie podano' }
const fr: typeof en = { selectCountry:'Sélectionner un pays',selectNationality:'Sélectionner une nationalité',searchCountry:'Rechercher un pays',searchNationality:'Rechercher une nationalité',noResults:'Aucun pays correspondant.',other:'Autre',specifyCountry:'Préciser le pays',specifyNationality:'Préciser la nationalité',notSpecified:'Non indiqué' }

function prefix(dictionary: typeof en) {
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [`countrySelector.${key}`, value]))
}

export const countrySelectorDictionaries = {
  en: prefix(en), de: prefix(de), ru: prefix(ru), tr: prefix(tr), uk: prefix(uk), pl: prefix(pl), fr: prefix(fr),
} as const
