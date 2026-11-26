import type { Locale } from '@/lib/i18n'

export const appNavigationStateDictionaries: Record<Locale, Record<string, string>> = {
  en: { 'app.refreshingData': 'Refreshing latest data...', 'app.refreshFailed': 'Could not refresh. Showing previously loaded data.', 'workspaces.loadFailed': 'Workspaces could not be loaded.', 'workspaces.retry': 'Retry' },
  de: { 'app.refreshingData': 'Aktuelle Daten werden aktualisiert...', 'app.refreshFailed': 'Aktualisierung fehlgeschlagen. Zuvor geladene Daten werden angezeigt.', 'workspaces.loadFailed': 'Arbeitsbereiche konnten nicht geladen werden.', 'workspaces.retry': 'Erneut versuchen' },
  ru: { 'app.refreshingData': 'Обновляем актуальные данные...', 'app.refreshFailed': 'Не удалось обновить данные. Показаны ранее загруженные данные.', 'workspaces.loadFailed': 'Не удалось загрузить рабочие пространства.', 'workspaces.retry': 'Повторить' },
  tr: { 'app.refreshingData': 'Güncel veriler yenileniyor...', 'app.refreshFailed': 'Veriler yenilenemedi. Daha önce yüklenen veriler gösteriliyor.', 'workspaces.loadFailed': 'Çalışma alanları yüklenemedi.', 'workspaces.retry': 'Yeniden dene' },
  uk: { 'app.refreshingData': 'Оновлюємо актуальні дані...', 'app.refreshFailed': 'Не вдалося оновити дані. Показано раніше завантажені дані.', 'workspaces.loadFailed': 'Не вдалося завантажити робочі простори.', 'workspaces.retry': 'Повторити' },
  pl: { 'app.refreshingData': 'Odświeżanie aktualnych danych...', 'app.refreshFailed': 'Nie udało się odświeżyć. Wyświetlane są wcześniej pobrane dane.', 'workspaces.loadFailed': 'Nie udało się załadować obszarów roboczych.', 'workspaces.retry': 'Ponów' },
  fr: { 'app.refreshingData': 'Actualisation des données...', 'app.refreshFailed': 'Actualisation impossible. Les données précédemment chargées sont affichées.', 'workspaces.loadFailed': 'Impossible de charger les espaces de travail.', 'workspaces.retry': 'Réessayer' },
}
