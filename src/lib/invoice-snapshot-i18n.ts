import type { Locale } from '@/lib/i18n'

export const invoiceSnapshotDictionaries: Record<Locale, Record<string, string>> = {
  en: {
    'invoices.legacySnapshotWarning': 'This older invoice has no saved seller/customer snapshot. Leonety cannot reconstruct its original details; the print will use the current workspace and client data. Continue?',
  },
  de: {
    'invoices.legacySnapshotWarning': 'Für diese ältere Rechnung wurde kein Verkäufer-/Kunden-Snapshot gespeichert. Die ursprünglichen Angaben lassen sich nicht rekonstruieren; beim Druck werden die aktuellen Workspace- und Kundendaten verwendet. Fortfahren?',
  },
  ru: {
    'invoices.legacySnapshotWarning': 'Для этого старого счета снимок данных продавца и клиента не сохранен. Восстановить исходные сведения нельзя; при печати будут использованы текущие данные рабочего пространства и клиента. Продолжить?',
  },
  tr: {
    'invoices.legacySnapshotWarning': 'Bu eski fatura için satıcı/müşteri anlık görüntüsü kaydedilmemiş. İlk bilgileri geri yüklemek mümkün değil; yazdırmada mevcut çalışma alanı ve müşteri bilgileri kullanılacak. Devam edilsin mi?',
  },
  uk: {
    'invoices.legacySnapshotWarning': 'Для цього старого рахунку не збережено знімок даних продавця й клієнта. Початкові дані неможливо відновити; під час друку буде використано поточні дані робочого простору та клієнта. Продовжити?',
  },
  pl: {
    'invoices.legacySnapshotWarning': 'Dla tej starszej faktury nie zapisano migawki sprzedawcy i klienta. Nie można odtworzyć pierwotnych danych; wydruk użyje obecnych danych przestrzeni i klienta. Kontynuować?',
  },
  fr: {
    'invoices.legacySnapshotWarning': 'Aucun instantané du vendeur et du client n’a été enregistré pour cette ancienne facture. Les données d’origine ne peuvent pas être reconstituées ; l’impression utilisera les données actuelles de l’espace et du client. Continuer ?',
  },
}
