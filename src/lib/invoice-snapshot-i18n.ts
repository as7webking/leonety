import type { Locale } from '@/lib/i18n'

export const invoiceSnapshotDictionaries: Record<Locale, Record<string, string>> = {
  en: {
    'invoices.legacySnapshotWarning': 'This older invoice has no saved seller/customer snapshot. Leonety cannot reconstruct its original details; printing will use current workspace and client details, but the invoice will not be changed. Saved line items and totals are printed as stored, without recalculation. Continue?',
  },
  de: {
    'invoices.legacySnapshotWarning': 'Für diese ältere Rechnung wurde kein Verkäufer-/Kunden-Snapshot gespeichert. Die ursprünglichen Angaben lassen sich nicht rekonstruieren; beim Druck werden aktuelle Workspace- und Kundendaten verwendet, die Rechnung selbst wird aber nicht geändert. Gespeicherte Positionen und Summen werden unverändert und ohne Neuberechnung gedruckt. Fortfahren?',
  },
  ru: {
    'invoices.legacySnapshotWarning': 'Для этого старого счёта снимок данных продавца и клиента не сохранён. Восстановить исходные сведения нельзя: при печати будут использованы текущие данные рабочего пространства и клиента, но сам счёт не изменится. Сохранённые позиции и итоги будут выведены как есть, без пересчёта. Продолжить?',
  },
  tr: {
    'invoices.legacySnapshotWarning': 'Bu eski fatura için satıcı/müşteri anlık görüntüsü kaydedilmemiş. İlk bilgileri geri yüklemek mümkün değil; yazdırmada mevcut çalışma alanı ve müşteri bilgileri kullanılır ancak fatura değiştirilmez. Kayıtlı kalemler ve toplamlar yeniden hesaplanmadan yazdırılır. Devam edilsin mi?',
  },
  uk: {
    'invoices.legacySnapshotWarning': 'Для цього старого рахунку не збережено знімок даних продавця й клієнта. Початкові дані неможливо відновити: під час друку буде використано поточні дані робочого простору та клієнта, але сам рахунок не зміниться. Збережені позиції й підсумки буде надруковано без перерахунку. Продовжити?',
  },
  pl: {
    'invoices.legacySnapshotWarning': 'Dla tej starszej faktury nie zapisano migawki sprzedawcy i klienta. Nie można odtworzyć pierwotnych danych; wydruk użyje obecnych danych przestrzeni i klienta, ale faktura nie zostanie zmieniona. Zapisane pozycje i sumy zostaną wydrukowane bez ponownego przeliczania. Kontynuować?',
  },
  fr: {
    'invoices.legacySnapshotWarning': 'Aucun instantané du vendeur et du client n’a été enregistré pour cette ancienne facture. Les données d’origine ne peuvent pas être reconstituées ; l’impression utilisera les données actuelles de l’espace et du client, sans modifier la facture. Les lignes et totaux enregistrés seront imprimés tels quels, sans recalcul. Continuer ?',
  },
}
