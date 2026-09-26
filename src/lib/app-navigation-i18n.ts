import type { Locale } from '@/lib/i18n'

export const appNavigationStateDictionaries: Record<Locale, Record<string, string>> = {
  en: { 'app.refreshingData': 'Refreshing latest data...', 'app.refreshFailed': 'Could not refresh. Showing previously loaded data.' },
  de: { 'app.refreshingData': 'Aktuelle Daten werden aktualisiert...', 'app.refreshFailed': 'Aktualisierung fehlgeschlagen. Zuvor geladene Daten werden angezeigt.' },
  ru: { 'app.refreshingData': 'Обновляем актуальные данные...', 'app.refreshFailed': 'Не удалось обновить данные. Показаны ранее загруженные данные.' },
  tr: { 'app.refreshingData': 'Güncel veriler yenileniyor...', 'app.refreshFailed': 'Veriler yenilenemedi. Daha önce yüklenen veriler gösteriliyor.' },
  uk: { 'app.refreshingData': 'Оновлюємо актуальні дані...', 'app.refreshFailed': 'Не вдалося оновити дані. Показано раніше завантажені дані.' },
  pl: { 'app.refreshingData': 'Odświeżanie aktualnych danych...', 'app.refreshFailed': 'Nie udało się odświeżyć. Wyświetlane są wcześniej pobrane dane.' },
  fr: { 'app.refreshingData': 'Actualisation des données...', 'app.refreshFailed': 'Actualisation impossible. Les données précédemment chargées sont affichées.' },
}
