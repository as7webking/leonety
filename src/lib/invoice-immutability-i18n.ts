import type { Locale } from '@/lib/i18n'

export const invoiceImmutabilityDictionaries: Record<Locale, Record<string, string>> = {
  en: {
    'invoices.issuedContentReadOnly': 'Issued invoice details and line items are locked. You can still update its status and record payment.',
    'invoices.paidInvoiceReadOnly': 'Issued invoice details, line items and recorded payments are locked. You can still update its status.',
  },
  de: {
    'invoices.issuedContentReadOnly': 'Ausgestellte Rechnungen und Positionen sind gesperrt. Status und Zahlung können weiterhin bearbeitet werden.',
    'invoices.paidInvoiceReadOnly': 'Ausgestellte Rechnungsdaten, Positionen und erfasste Zahlungen sind gesperrt. Der Status kann weiterhin geändert werden.',
  },
  ru: {
    'invoices.issuedContentReadOnly': 'Данные и позиции выставленного счёта заблокированы. Статус и оплату по-прежнему можно обновить.',
    'invoices.paidInvoiceReadOnly': 'Данные, позиции и зафиксированные платежи по выставленному счёту заблокированы. Статус можно изменить.',
  },
  tr: {
    'invoices.issuedContentReadOnly': 'Düzenlenmiş faturanın bilgileri ve kalemleri kilitlidir. Durum ve ödeme yine de güncellenebilir.',
    'invoices.paidInvoiceReadOnly': 'Düzenlenmiş faturanın bilgileri, kalemleri ve kayıtlı ödemeleri kilitlidir. Durum yine de güncellenebilir.',
  },
  uk: {
    'invoices.issuedContentReadOnly': 'Дані та позиції виставленого рахунку заблоковано. Статус і оплату можна оновити.',
    'invoices.paidInvoiceReadOnly': 'Дані, позиції та зафіксовані платежі виставленого рахунку заблоковано. Статус можна змінити.',
  },
  pl: {
    'invoices.issuedContentReadOnly': 'Dane i pozycje wystawionej faktury są zablokowane. Nadal można zmienić status i zarejestrować płatność.',
    'invoices.paidInvoiceReadOnly': 'Dane, pozycje i zarejestrowane płatności wystawionej faktury są zablokowane. Status można nadal zmienić.',
  },
  fr: {
    'invoices.issuedContentReadOnly': 'Les détails et les lignes de la facture émise sont verrouillés. Son statut et son paiement restent modifiables.',
    'invoices.paidInvoiceReadOnly': 'Les détails, les lignes et les paiements enregistrés de la facture émise sont verrouillés. Son statut reste modifiable.',
  },
}
