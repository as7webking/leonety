import type { Locale } from '@/lib/i18n'

type Dictionary = Record<string, string>

export const transactionOrderingDictionaries: Record<Locale, Dictionary> = {
  en: {
    'transactions.order': 'Order', 'transactions.order.date-desc': 'Date · newest first', 'transactions.order.date-asc': 'Date · oldest first', 'transactions.order.amount-desc': 'Amount · high to low', 'transactions.order.amount-asc': 'Amount · low to high', 'transactions.order.title-asc': 'Title · A–Z', 'transactions.order.title-desc': 'Title · Z–A',
    'transactions.groupOrder': 'Group order', 'transactions.group.chronological': 'Chronological', 'transactions.group.income-first': 'Income first', 'transactions.group.expenses-first': 'Expenses first', 'transactions.withinDay': 'Within each day',
    'transactions.typeFilter': 'Transaction type', 'transactions.allTypes': 'All types', 'transactions.categoryFilter': 'Category', 'transactions.allCategories': 'All categories', 'transactions.kassenbuchChronology': 'Kassenbuch keeps accounting chronology so running balances remain accurate.',
    'transactions.printOrdering': 'Presentation order', 'transactions.printFilters': 'Filters', 'transactions.kassenbuchFixedOrder': 'Kassenbuch uses all transactions in accounting chronology. List filters and presentation sorting do not change its rows or balances.',
  },
  de: {
    'transactions.order': 'Sortierung', 'transactions.order.date-desc': 'Datum · neueste zuerst', 'transactions.order.date-asc': 'Datum · älteste zuerst', 'transactions.order.amount-desc': 'Betrag · absteigend', 'transactions.order.amount-asc': 'Betrag · aufsteigend', 'transactions.order.title-asc': 'Titel · A–Z', 'transactions.order.title-desc': 'Titel · Z–A',
    'transactions.groupOrder': 'Reihenfolge der Gruppen', 'transactions.group.chronological': 'Chronologisch', 'transactions.group.income-first': 'Einnahmen zuerst', 'transactions.group.expenses-first': 'Ausgaben zuerst', 'transactions.withinDay': 'Innerhalb jedes Tages',
    'transactions.typeFilter': 'Transaktionstyp', 'transactions.allTypes': 'Alle Typen', 'transactions.categoryFilter': 'Kategorie', 'transactions.allCategories': 'Alle Kategorien', 'transactions.kassenbuchChronology': 'Das Kassenbuch behält die Buchungschronologie bei, damit laufende Bestände korrekt bleiben.',
    'transactions.printOrdering': 'Darstellungsreihenfolge', 'transactions.printFilters': 'Filter', 'transactions.kassenbuchFixedOrder': 'Das Kassenbuch nutzt alle Transaktionen in Buchungschronologie. Listenfilter und Darstellungs-Sortierung ändern weder Zeilenreihenfolge noch Bestände.',
  },
  ru: {
    'transactions.order': 'Сортировка', 'transactions.order.date-desc': 'Дата · сначала новые', 'transactions.order.date-asc': 'Дата · сначала старые', 'transactions.order.amount-desc': 'Сумма · по убыванию', 'transactions.order.amount-asc': 'Сумма · по возрастанию', 'transactions.order.title-asc': 'Название · А–Я', 'transactions.order.title-desc': 'Название · Я–А',
    'transactions.groupOrder': 'Порядок групп', 'transactions.group.chronological': 'Хронологически', 'transactions.group.income-first': 'Сначала доходы', 'transactions.group.expenses-first': 'Сначала расходы', 'transactions.withinDay': 'Внутри каждого дня',
    'transactions.typeFilter': 'Тип операции', 'transactions.allTypes': 'Все типы', 'transactions.categoryFilter': 'Категория', 'transactions.allCategories': 'Все категории', 'transactions.kassenbuchChronology': 'В кассовой книге сохраняется хронология учёта, чтобы текущий остаток оставался точным.',
    'transactions.printOrdering': 'Порядок отображения', 'transactions.printFilters': 'Фильтры', 'transactions.kassenbuchFixedOrder': 'В кассовой книге учитываются все операции в хронологии учёта. Фильтры списка и сортировка не меняют строки и остатки.',
  },
  tr: {
    'transactions.order': 'Sıralama', 'transactions.order.date-desc': 'Tarih · en yeniden eskiye', 'transactions.order.date-asc': 'Tarih · en eskiden yeniye', 'transactions.order.amount-desc': 'Tutar · yüksekten düşüğe', 'transactions.order.amount-asc': 'Tutar · düşükten yükseğe', 'transactions.order.title-asc': 'Başlık · A–Z', 'transactions.order.title-desc': 'Başlık · Z–A',
    'transactions.groupOrder': 'Grup sırası', 'transactions.group.chronological': 'Kronolojik', 'transactions.group.income-first': 'Önce gelirler', 'transactions.group.expenses-first': 'Önce giderler', 'transactions.withinDay': 'Her gün içinde',
    'transactions.typeFilter': 'İşlem türü', 'transactions.allTypes': 'Tüm türler', 'transactions.categoryFilter': 'Kategori', 'transactions.allCategories': 'Tüm kategoriler', 'transactions.kassenbuchChronology': 'Kasa defterinde bakiyelerin doğru kalması için muhasebe kronolojisi korunur.',
    'transactions.printOrdering': 'Görüntüleme sırası', 'transactions.printFilters': 'Filtreler', 'transactions.kassenbuchFixedOrder': 'Kasa defterinde tüm işlemler muhasebe kronolojisiyle kullanılır. Liste filtreleri ve sıralama satırları veya bakiyeleri değiştirmez.',
  },
  uk: {
    'transactions.order': 'Сортування', 'transactions.order.date-desc': 'Дата · спочатку нові', 'transactions.order.date-asc': 'Дата · спочатку старі', 'transactions.order.amount-desc': 'Сума · за спаданням', 'transactions.order.amount-asc': 'Сума · за зростанням', 'transactions.order.title-asc': 'Назва · А–Я', 'transactions.order.title-desc': 'Назва · Я–А',
    'transactions.groupOrder': 'Порядок груп', 'transactions.group.chronological': 'Хронологічно', 'transactions.group.income-first': 'Спочатку доходи', 'transactions.group.expenses-first': 'Спочатку витрати', 'transactions.withinDay': 'У межах кожного дня',
    'transactions.typeFilter': 'Тип операції', 'transactions.allTypes': 'Усі типи', 'transactions.categoryFilter': 'Категорія', 'transactions.allCategories': 'Усі категорії', 'transactions.kassenbuchChronology': 'У касовій книзі збережено хронологію обліку, щоб поточний залишок був точним.',
    'transactions.printOrdering': 'Порядок відображення', 'transactions.printFilters': 'Фільтри', 'transactions.kassenbuchFixedOrder': 'У касовій книзі використовуються всі операції в хронології обліку. Фільтри списку й сортування не змінюють рядки та залишки.',
  },
  pl: {
    'transactions.order': 'Sortowanie', 'transactions.order.date-desc': 'Data · od najnowszych', 'transactions.order.date-asc': 'Data · od najstarszych', 'transactions.order.amount-desc': 'Kwota · malejąco', 'transactions.order.amount-asc': 'Kwota · rosnąco', 'transactions.order.title-asc': 'Tytuł · A–Z', 'transactions.order.title-desc': 'Tytuł · Z–A',
    'transactions.groupOrder': 'Kolejność grup', 'transactions.group.chronological': 'Chronologicznie', 'transactions.group.income-first': 'Najpierw przychody', 'transactions.group.expenses-first': 'Najpierw wydatki', 'transactions.withinDay': 'W obrębie dnia',
    'transactions.typeFilter': 'Typ transakcji', 'transactions.allTypes': 'Wszystkie typy', 'transactions.categoryFilter': 'Kategoria', 'transactions.allCategories': 'Wszystkie kategorie', 'transactions.kassenbuchChronology': 'Księga kasowa zachowuje chronologię księgową, aby saldo bieżące pozostało prawidłowe.',
    'transactions.printOrdering': 'Kolejność prezentacji', 'transactions.printFilters': 'Filtry', 'transactions.kassenbuchFixedOrder': 'Księga kasowa używa wszystkich transakcji w chronologii księgowej. Filtry listy i sortowanie nie zmieniają wierszy ani sald.',
  },
  fr: {
    'transactions.order': 'Tri', 'transactions.order.date-desc': 'Date · plus récent', 'transactions.order.date-asc': 'Date · plus ancien', 'transactions.order.amount-desc': 'Montant · décroissant', 'transactions.order.amount-asc': 'Montant · croissant', 'transactions.order.title-asc': 'Titre · A–Z', 'transactions.order.title-desc': 'Titre · Z–A',
    'transactions.groupOrder': 'Ordre des groupes', 'transactions.group.chronological': 'Chronologique', 'transactions.group.income-first': 'Revenus en premier', 'transactions.group.expenses-first': 'Dépenses en premier', 'transactions.withinDay': 'Au sein de chaque journée',
    'transactions.typeFilter': 'Type de transaction', 'transactions.allTypes': 'Tous les types', 'transactions.categoryFilter': 'Catégorie', 'transactions.allCategories': 'Toutes les catégories', 'transactions.kassenbuchChronology': 'Le livre de caisse conserve la chronologie comptable afin de préserver l’exactitude du solde courant.',
    'transactions.printOrdering': 'Ordre de présentation', 'transactions.printFilters': 'Filtres', 'transactions.kassenbuchFixedOrder': 'Le livre de caisse utilise toutes les transactions en chronologie comptable. Les filtres de liste et le tri ne modifient ni les lignes ni les soldes.',
  },
}
