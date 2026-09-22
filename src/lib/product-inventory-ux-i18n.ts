const en = {
  actions: 'Actions', channelsColumn: 'Channels', duplicate: 'Duplicate', exportMenu: 'Export',
  backToInventory: 'Back to inventory', inventorySearch: 'Search inventory', inventoryAll: 'All products',
  inventoryLow: 'Low stock only', editProduct: 'Edit product', noInventoryMatches: 'No products match the current search or filter.',
}
const de: typeof en = { actions:'Aktionen',channelsColumn:'Kanäle',duplicate:'Duplizieren',exportMenu:'Exportieren',backToInventory:'Zurück zum Lager',inventorySearch:'Lager durchsuchen',inventoryAll:'Alle Produkte',inventoryLow:'Nur niedriger Bestand',editProduct:'Produkt bearbeiten',noInventoryMatches:'Keine Produkte entsprechen der aktuellen Suche oder dem Filter.' }
const ru: typeof en = { actions:'Действия',channelsColumn:'Каналы',duplicate:'Дублировать',exportMenu:'Экспорт',backToInventory:'Назад на склад',inventorySearch:'Поиск по складу',inventoryAll:'Все товары',inventoryLow:'Только низкий остаток',editProduct:'Редактировать товар',noInventoryMatches:'Нет товаров, соответствующих поиску или фильтру.' }
const tr: typeof en = { actions:'İşlemler',channelsColumn:'Kanallar',duplicate:'Çoğalt',exportMenu:'Dışa aktar',backToInventory:'Stoka dön',inventorySearch:'Stokta ara',inventoryAll:'Tüm ürünler',inventoryLow:'Yalnızca düşük stok',editProduct:'Ürünü düzenle',noInventoryMatches:'Geçerli arama veya filtreyle eşleşen ürün yok.' }
const uk: typeof en = { actions:'Дії',channelsColumn:'Канали',duplicate:'Дублювати',exportMenu:'Експорт',backToInventory:'Назад до складу',inventorySearch:'Пошук на складі',inventoryAll:'Усі товари',inventoryLow:'Лише низький залишок',editProduct:'Редагувати товар',noInventoryMatches:'Немає товарів, що відповідають пошуку або фільтру.' }
const pl: typeof en = { actions:'Działania',channelsColumn:'Kanały',duplicate:'Duplikuj',exportMenu:'Eksportuj',backToInventory:'Wróć do magazynu',inventorySearch:'Przeszukaj magazyn',inventoryAll:'Wszystkie produkty',inventoryLow:'Tylko niski stan',editProduct:'Edytuj produkt',noInventoryMatches:'Brak produktów pasujących do wyszukiwania lub filtra.' }
const fr: typeof en = { actions:'Actions',channelsColumn:'Canaux',duplicate:'Dupliquer',exportMenu:'Exporter',backToInventory:'Retour au stock',inventorySearch:'Rechercher dans le stock',inventoryAll:'Tous les produits',inventoryLow:'Stock faible uniquement',editProduct:'Modifier le produit',noInventoryMatches:'Aucun produit ne correspond à la recherche ou au filtre.' }

function prefix(dictionary: typeof en) {
  return Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [`productUx.${key}`, value]))
}

export const productInventoryUxDictionaries = {
  en: prefix(en), de: prefix(de), ru: prefix(ru), tr: prefix(tr), uk: prefix(uk), pl: prefix(pl), fr: prefix(fr),
} as const
