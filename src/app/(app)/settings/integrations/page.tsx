'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Clock3, KeyRound, Plug, Store, Unplug } from 'lucide-react'
import { EmptyState, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import type { Locale } from '@/lib/i18n'

type Provider = 'woocommerce' | 'shopify' | 'opencart' | 'google_merchant' | 'whatsapp_business' | 'iss_pos'
type IntegrationStatus = 'not_connected' | 'connected' | 'error' | 'disabled'
type WhatsAppClientCreationMode = 'ask' | 'auto_create_lead' | 'never'

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }) => void
      login: (
        callback: (response: { authResponse?: { code?: string }; status?: string }) => void,
        options: Record<string, unknown>
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

interface StoreIntegration {
  id: string
  provider: Provider
  storeName: string
  storeUrl: string
  externalAccountId: string
  apiKeyPreview: string
  apiSecretPreview: string
  merchantId: string
  accessTokenPreview: string
  refreshTokenPreview: string
  status: IntegrationStatus
  lastSyncAt: string | null
  connectedAt: string | null
  lastWebhookAt: string | null
  errorMessage: string
  metadata: Record<string, unknown> | null
  updatedAt: string | null
}

interface IntegrationForm {
  storeName: string
  storeUrl: string
  externalAccountId: string
  apiKey: string
  apiSecret: string
  merchantId: string
  accessToken: string
  refreshToken: string
  clientCreationMode: WhatsAppClientCreationMode
}

const providerOptions: Array<{ value: Provider; label: string; fields: Array<keyof IntegrationForm>; directSettings?: string }> = [
  {
    value: 'woocommerce',
    label: 'WooCommerce',
    fields: ['storeName', 'storeUrl', 'apiKey', 'apiSecret'],
    directSettings: '/app/settings/integrations/woocommerce',
  },
  {
    value: 'shopify',
    label: 'Shopify',
    fields: ['storeName', 'storeUrl', 'externalAccountId', 'accessToken', 'refreshToken'],
  },
  {
    value: 'opencart',
    label: 'OpenCart',
    fields: ['storeName', 'storeUrl', 'apiKey', 'apiSecret'],
  },
  {
    value: 'google_merchant',
    label: 'Google Merchant / Maps',
    fields: ['storeName', 'externalAccountId', 'merchantId', 'accessToken', 'refreshToken'],
  },
  {
    value: 'whatsapp_business',
    label: 'WhatsApp Business',
    fields: [],
  },
  {
    value: 'iss_pos',
    label: 'ISS POS',
    fields: ['storeName', 'storeUrl', 'externalAccountId'],
  },
]

const emptyForm: IntegrationForm = {
  storeName: '',
  storeUrl: '',
  externalAccountId: '',
  apiKey: '',
  apiSecret: '',
  merchantId: '',
  accessToken: '',
  refreshToken: '',
  clientCreationMode: 'ask',
}

const copy: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Store integrations',
    description: 'Connect stores and marketplaces for this workspace.',
    provider: 'Provider',
    storeName: 'Store name',
    storeUrl: 'Store URL',
    externalAccountId: 'External account ID',
    apiKey: 'API key / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Save connection',
    disconnect: 'Disconnect',
    openWoo: 'Open WooCommerce tools',
    connected: 'Connected',
    notConnected: 'Not connected',
    error: 'Error',
    lastSync: 'Last sync',
    neverSynced: 'Never synced',
    saved: 'Integration saved.',
    removed: 'Integration removed.',
    dbRequired: 'Run the store integrations Supabase SQL before saving connections.',
    secretHint: 'Leave blank to keep the saved secret.',
    serverOnly: 'Secrets are stored server-side per workspace and are never exposed to the browser.',
    setupNote: 'OAuth providers need server routes later. This page stores the workspace connection data safely first.',
    previews: 'Saved credentials',
    oauthConnect: 'Connect with OAuth',
    testOpenCart: 'Test OpenCart',
    exportProducts: 'Export products CSV',
    importProducts: 'Import products',
    syncProducts: 'Sync products',
    imported: 'Imported products: {count}.',
    synced: 'Synced: {synced}. Failed: {failed}.',
    openConnection: 'Open connection',
    schemaUnavailable: 'Store integrations are temporarily unavailable. Run the Supabase migration and try again.',
    issSetup: 'ISS POS requires official API documentation and credentials before Leonety can test or sync it.',
    setupRequired: 'Setup required',
    integrationGuideTitle: 'Connection guide',
    googleLoginGuide: 'Google login is configured in Supabase Auth, not here. Create a Google OAuth web client, paste Client ID and Client Secret into Supabase, and allow /auth/callback for local and production.',
    facebookLoginGuide: 'Facebook login is configured in Supabase Auth. Create a Meta app, add Facebook Login, paste App ID and App Secret into Supabase, and test with allowed test users before going live.',
    googleMapsGuide: 'Google Maps address autocomplete is separate from Google login. Use a restricted server-side Google Maps key only if ADDRESS_PROVIDER=google_maps is enabled; otherwise Leonety uses the default address provider.',
    whatsappGuide: 'WhatsApp Business cannot read personal contacts or chats. MVP support is manual/CSV client capture; Cloud API webhooks require Meta Business setup and signature verification.',
    issGuide: 'ISS POS is disabled until the vendor provides API documentation, base URL, auth method, product/stock/sales endpoints, branch identifier, webhooks or polling rules, rate limits and a test account.',
    credentialsNeverExposed: 'Credentials are submitted to server routes only, encrypted per workspace where stored, and shown back only as masked metadata.',
    connectWhatsapp: 'Connect WhatsApp Business',
    whatsappSignupRunning: 'Opening Meta Embedded Signup...',
    whatsappConnected: 'WhatsApp Business connected.',
    whatsappSetupRequired: 'Meta Embedded Signup is not configured yet.',
    whatsappClientMode: 'Client creation mode',
    whatsappClientModeAsk: 'Ask before creating',
    whatsappClientModeAuto: 'Automatically create lead',
    whatsappClientModeNever: 'Never create automatically',
    whatsappNumber: 'Connected number',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Webhook status',
    lastWebhook: 'Last webhook event',
    noWebhookYet: 'No webhook event yet',
  },
  de: {
    title: 'Shop-Integrationen',
    description: 'Verbinde Shops und Marktplätze für diesen Arbeitsbereich.',
    provider: 'Anbieter',
    storeName: 'Shop-Name',
    storeUrl: 'Shop-URL',
    externalAccountId: 'Externe Konto-ID',
    apiKey: 'API-Key / Consumer Key',
    apiSecret: 'API-Secret / Consumer Secret',
    merchantId: 'Merchant-ID',
    accessToken: 'Access Token',
    refreshToken: 'Refresh Token',
    save: 'Verbindung speichern',
    disconnect: 'Trennen',
    openWoo: 'WooCommerce-Werkzeuge öffnen',
    connected: 'Verbunden',
    notConnected: 'Nicht verbunden',
    error: 'Fehler',
    lastSync: 'Letzte Synchronisierung',
    neverSynced: 'Noch nie synchronisiert',
    saved: 'Integration gespeichert.',
    removed: 'Integration entfernt.',
    dbRequired: 'Führe zuerst das Supabase-SQL für Shop-Integrationen aus.',
    secretHint: 'Leer lassen, um das gespeicherte Secret zu behalten.',
    serverOnly: 'Secrets werden serverseitig pro Arbeitsbereich gespeichert und nie im Browser offengelegt.',
    setupNote: 'OAuth-Anbieter benötigen später Server-Routen. Diese Seite speichert zuerst die Arbeitsbereichsverbindung sicher.',
    previews: 'Gespeicherte Zugangsdaten',
    oauthConnect: 'Mit OAuth verbinden',
    testOpenCart: 'OpenCart testen',
    exportProducts: 'Produkte als CSV exportieren',
    importProducts: 'Produkte importieren',
    syncProducts: 'Produkte synchronisieren',
    imported: 'Importierte Produkte: {count}.',
    synced: 'Synchronisiert: {synced}. Fehlgeschlagen: {failed}.',
    openConnection: 'Verbindung öffnen',
    schemaUnavailable: 'Shop-Integrationen sind vorübergehend nicht verfügbar. Führe die Supabase-Migration aus und versuche es erneut.',
    issSetup: 'ISS POS benötigt offizielle API-Dokumentation und Zugangsdaten, bevor Leonety testen oder synchronisieren kann.',
    setupRequired: 'Einrichtung erforderlich',
    integrationGuideTitle: 'Verbindungsanleitung',
    googleLoginGuide: 'Google Login wird in Supabase Auth konfiguriert, nicht hier. Erstelle einen Google OAuth Web Client, füge Client ID und Client Secret in Supabase ein und erlaube /auth/callback lokal und in Produktion.',
    facebookLoginGuide: 'Facebook Login wird in Supabase Auth konfiguriert. Erstelle eine Meta-App, füge Facebook Login hinzu, trage App ID und App Secret in Supabase ein und teste mit erlaubten Testnutzern vor Live-Schaltung.',
    googleMapsGuide: 'Google Maps Adresssuche ist getrennt von Google Login. Nutze einen eingeschränkten serverseitigen Google Maps Key nur mit ADDRESS_PROVIDER=google_maps; sonst verwendet Leonety den Standard-Adressanbieter.',
    whatsappGuide: 'WhatsApp Business kann keine privaten Kontakte oder Chats lesen. MVP ist manuelle/CSV-Erfassung; Cloud-API-Webhooks brauchen Meta Business Setup und Signaturprüfung.',
    issGuide: 'ISS POS bleibt deaktiviert, bis der Anbieter API-Dokumentation, Base URL, Auth-Methode, Produkt-/Bestands-/Sales-Endpunkte, Filial-ID, Webhooks oder Polling, Rate Limits und Testkonto liefert.',
    credentialsNeverExposed: 'Zugangsdaten werden nur an Server-Routen gesendet, pro Workspace verschlüsselt gespeichert und nur maskiert angezeigt.',
    connectWhatsapp: 'WhatsApp Business verbinden',
    whatsappSignupRunning: 'Meta Embedded Signup wird geöffnet...',
    whatsappConnected: 'WhatsApp Business verbunden.',
    whatsappSetupRequired: 'Meta Embedded Signup ist noch nicht konfiguriert.',
    whatsappClientMode: 'Kundenerstellung',
    whatsappClientModeAsk: 'Vor dem Erstellen fragen',
    whatsappClientModeAuto: 'Lead automatisch erstellen',
    whatsappClientModeNever: 'Nie automatisch erstellen',
    whatsappNumber: 'Verbundene Nummer',
    whatsappWaba: 'WABA-ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Webhook-Status',
    lastWebhook: 'Letztes Webhook-Event',
    noWebhookYet: 'Noch kein Webhook-Event',
  },
  tr: {
    title: 'Mağaza entegrasyonları',
    description: 'Bu çalışma alanı için mağaza ve pazaryerlerini bağlayın.',
    provider: 'Sağlayıcı',
    storeName: 'Mağaza adı',
    storeUrl: 'Mağaza URL',
    externalAccountId: 'Harici hesap ID',
    apiKey: 'API anahtarı / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Bağlantıyı kaydet',
    disconnect: 'Bağlantıyı kes',
    openWoo: 'WooCommerce araçlarını aç',
    connected: 'Bağlı',
    notConnected: 'Bağlı değil',
    error: 'Hata',
    lastSync: 'Son senkronizasyon',
    neverSynced: 'Henüz senkronize edilmedi',
    saved: 'Entegrasyon kaydedildi.',
    removed: 'Entegrasyon kaldırıldı.',
    dbRequired: 'Bağlantıları kaydetmeden önce store integrations Supabase SQL çalıştırın.',
    secretHint: 'Kayıtlı secret kalsın istiyorsanız boş bırakın.',
    serverOnly: 'Secret değerleri çalışma alanına göre server-side saklanır ve tarayıcıya verilmez.',
    setupNote: 'OAuth sağlayıcıları için daha sonra server route gerekir. Bu sayfa önce bağlantı verilerini güvenli saklar.',
    previews: 'Kayıtlı bilgiler',
    oauthConnect: 'OAuth ile bağlan',
    testOpenCart: 'OpenCart test et',
    exportProducts: 'Ürünleri CSV dışa aktar',
    importProducts: 'Ürünleri içe aktar',
    syncProducts: 'Ürünleri senkronize et',
    imported: 'İçe aktarılan ürünler: {count}.',
    synced: 'Senkronize: {synced}. Hatalı: {failed}.',
    openConnection: 'Bağlantıyı aç',
    schemaUnavailable: 'Mağaza entegrasyonları geçici olarak kullanılamıyor. Supabase migration çalıştırıp tekrar deneyin.',
    issSetup: 'Leonety test veya senkronizasyon yapmadan önce ISS POS için resmi API dokümantasyonu ve erişim bilgileri gerekir.',
    setupRequired: 'Kurulum gerekli',
    integrationGuideTitle: 'Bağlantı kılavuzu',
    googleLoginGuide: 'Google girişi burada değil Supabase Auth içinde yapılandırılır. Google OAuth web client oluşturun, Client ID ve Client Secret değerlerini Supabase’e girin ve yerel/production /auth/callback adreslerini izinli yapın.',
    facebookLoginGuide: 'Facebook girişi Supabase Auth içinde yapılandırılır. Meta app oluşturun, Facebook Login ekleyin, App ID ve App Secret değerlerini Supabase’e girin ve canlıya almadan önce test kullanıcılarıyla deneyin.',
    googleMapsGuide: 'Google Maps adres tamamlama Google girişinden ayrıdır. ADDRESS_PROVIDER=google_maps etkinse yalnızca kısıtlı server-side Google Maps key kullanın; aksi halde Leonety varsayılan adres sağlayıcıyı kullanır.',
    whatsappGuide: 'WhatsApp Business kişisel rehberi veya sohbetleri okuyamaz. MVP manuel/CSV müşteri kaydıdır; Cloud API webhookları Meta Business kurulumu ve imza doğrulaması ister.',
    issGuide: 'ISS POS, satıcı API dokümantasyonu, base URL, auth yöntemi, ürün/stok/satış endpointleri, şube ID, webhook veya polling kuralları, rate limit ve test hesabı vermeden devre dışıdır.',
    credentialsNeverExposed: 'Kimlik bilgileri yalnızca server route’lara gönderilir, workspace bazında şifrelenir ve UI’da sadece maskeli metadata olarak gösterilir.',
    connectWhatsapp: 'WhatsApp Business bağla',
    whatsappSignupRunning: 'Meta Embedded Signup açılıyor...',
    whatsappConnected: 'WhatsApp Business bağlandı.',
    whatsappSetupRequired: 'Meta Embedded Signup henüz yapılandırılmadı.',
    whatsappClientMode: 'Müşteri oluşturma modu',
    whatsappClientModeAsk: 'Oluşturmadan önce sor',
    whatsappClientModeAuto: 'Lead otomatik oluştur',
    whatsappClientModeNever: 'Asla otomatik oluşturma',
    whatsappNumber: 'Bağlı numara',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Webhook durumu',
    lastWebhook: 'Son webhook olayı',
    noWebhookYet: 'Henüz webhook olayı yok',
  },
  ru: {
    title: 'Интеграции магазинов',
    description: 'Подключайте магазины и маркетплейсы для этого рабочего пространства.',
    provider: 'Провайдер',
    storeName: 'Название магазина',
    storeUrl: 'URL магазина',
    externalAccountId: 'Внешний ID аккаунта',
    apiKey: 'API key / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Сохранить подключение',
    disconnect: 'Отключить',
    openWoo: 'Открыть инструменты WooCommerce',
    connected: 'Подключено',
    notConnected: 'Не подключено',
    error: 'Ошибка',
    lastSync: 'Последняя синхронизация',
    neverSynced: 'Еще не синхронизировалось',
    saved: 'Интеграция сохранена.',
    removed: 'Интеграция удалена.',
    dbRequired: 'Сначала выполните Supabase SQL для store integrations.',
    secretHint: 'Оставьте пустым, чтобы сохранить уже записанный секрет.',
    serverOnly: 'Секреты хранятся server-side для каждого workspace и не раскрываются браузеру.',
    setupNote: 'Для OAuth-провайдеров позже нужны серверные routes. Эта страница сначала безопасно хранит данные подключения workspace.',
    previews: 'Сохраненные данные',
    oauthConnect: 'Подключить через OAuth',
    testOpenCart: 'Проверить OpenCart',
    exportProducts: 'Экспорт товаров CSV',
    importProducts: 'Импорт товаров',
    syncProducts: 'Синхронизировать товары',
    imported: 'Импортировано товаров: {count}.',
    synced: 'Синхронизировано: {synced}. Ошибок: {failed}.',
    openConnection: 'Открыть подключение',
    schemaUnavailable: 'Интеграции магазинов временно недоступны. Выполните Supabase migration и попробуйте снова.',
    issSetup: 'Для ISS POS нужна официальная API-документация и учетные данные, прежде чем Leonety сможет тестировать или синхронизировать подключение.',
    setupRequired: 'Нужна настройка',
    integrationGuideTitle: 'Инструкция подключения',
    googleLoginGuide: 'Google login настраивается в Supabase Auth, не на этой странице. Создайте Google OAuth web client, вставьте Client ID и Client Secret в Supabase и разрешите /auth/callback для local и production.',
    facebookLoginGuide: 'Facebook login настраивается через Supabase Auth. Создайте Meta app, добавьте Facebook Login, вставьте App ID и App Secret в Supabase и проверьте test users перед live.',
    googleMapsGuide: 'Google Maps для адресов отдельный от Google login. Включайте server-side Google Maps key только при ADDRESS_PROVIDER=google_maps; иначе Leonety использует стандартного address provider.',
    whatsappGuide: 'WhatsApp Business не может читать личные контакты и чаты. MVP: ручное/CSV добавление клиентов; Cloud API webhooks требуют Meta Business setup и проверки подписи.',
    issGuide: 'ISS POS отключен, пока вендор не даст API-документацию, base URL, метод auth, endpoints товаров/склада/продаж, branch/store ID, webhooks или polling, rate limits и test account.',
    credentialsNeverExposed: 'Credentials отправляются только на server routes, хранятся encrypted per workspace и показываются обратно только masked.',
    connectWhatsapp: 'Подключить WhatsApp Business',
    whatsappSignupRunning: 'Открывается Meta Embedded Signup...',
    whatsappConnected: 'WhatsApp Business подключен.',
    whatsappSetupRequired: 'Meta Embedded Signup еще не настроен.',
    whatsappClientMode: 'Создание клиентов',
    whatsappClientModeAsk: 'Спрашивать перед созданием',
    whatsappClientModeAuto: 'Автоматически создавать lead',
    whatsappClientModeNever: 'Никогда не создавать автоматически',
    whatsappNumber: 'Подключенный номер',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Статус webhook',
    lastWebhook: 'Последнее webhook-событие',
    noWebhookYet: 'Webhook-событий еще нет',
  },
  uk: {
    title: 'Інтеграції магазинів',
    description: 'Підключайте магазини та маркетплейси для цього робочого простору.',
    provider: 'Провайдер',
    storeName: 'Назва магазину',
    storeUrl: 'URL магазину',
    externalAccountId: 'Зовнішній ID акаунта',
    apiKey: 'API key / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Зберегти підключення',
    disconnect: 'Відключити',
    openWoo: 'Відкрити інструменти WooCommerce',
    connected: 'Підключено',
    notConnected: 'Не підключено',
    error: 'Помилка',
    lastSync: 'Остання синхронізація',
    neverSynced: 'Ще не синхронізовано',
    saved: 'Інтеграцію збережено.',
    removed: 'Інтеграцію видалено.',
    dbRequired: 'Спочатку виконайте Supabase SQL для store integrations.',
    secretHint: 'Залиште порожнім, щоб зберегти вже записаний секрет.',
    serverOnly: 'Секрети зберігаються server-side для кожного workspace і не передаються браузеру.',
    setupNote: 'Для OAuth-провайдерів пізніше потрібні server routes. Ця сторінка спочатку безпечно зберігає дані підключення workspace.',
    previews: 'Збережені дані',
    oauthConnect: 'Підключити через OAuth',
    testOpenCart: 'Перевірити OpenCart',
    exportProducts: 'Експорт товарів CSV',
    importProducts: 'Імпорт товарів',
    syncProducts: 'Синхронізувати товари',
    imported: 'Імпортовано товарів: {count}.',
    synced: 'Синхронізовано: {synced}. Помилок: {failed}.',
    openConnection: 'Відкрити підключення',
    schemaUnavailable: 'Інтеграції магазинів тимчасово недоступні. Виконайте Supabase migration і спробуйте ще раз.',
    issSetup: 'Для ISS POS потрібна офіційна API-документація та облікові дані, перш ніж Leonety зможе тестувати або синхронізувати підключення.',
    setupRequired: 'Потрібне налаштування',
    integrationGuideTitle: 'Інструкція підключення',
    googleLoginGuide: 'Google login налаштовується в Supabase Auth, не тут. Створіть Google OAuth web client, вставте Client ID і Client Secret у Supabase та дозвольте /auth/callback для local і production.',
    facebookLoginGuide: 'Facebook login налаштовується через Supabase Auth. Створіть Meta app, додайте Facebook Login, вставте App ID і App Secret у Supabase та протестуйте test users перед live.',
    googleMapsGuide: 'Google Maps для адрес окремий від Google login. Використовуйте server-side Google Maps key тільки з ADDRESS_PROVIDER=google_maps; інакше Leonety використовує стандартного address provider.',
    whatsappGuide: 'WhatsApp Business не може читати приватні контакти чи чати. MVP: ручне/CSV додавання клієнтів; Cloud API webhooks потребують Meta Business setup і перевірки підпису.',
    issGuide: 'ISS POS вимкнено, доки вендор не надасть API-документацію, base URL, auth method, endpoints товарів/складу/продажів, branch/store ID, webhooks або polling, rate limits і test account.',
    credentialsNeverExposed: 'Credentials надсилаються тільки на server routes, зберігаються encrypted per workspace і показуються лише masked.',
    connectWhatsapp: 'Підключити WhatsApp Business',
    whatsappSignupRunning: 'Відкривається Meta Embedded Signup...',
    whatsappConnected: 'WhatsApp Business підключено.',
    whatsappSetupRequired: 'Meta Embedded Signup ще не налаштовано.',
    whatsappClientMode: 'Створення клієнтів',
    whatsappClientModeAsk: 'Запитувати перед створенням',
    whatsappClientModeAuto: 'Автоматично створювати lead',
    whatsappClientModeNever: 'Ніколи не створювати автоматично',
    whatsappNumber: 'Підключений номер',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Статус webhook',
    lastWebhook: 'Остання webhook-подія',
    noWebhookYet: 'Webhook-подій ще немає',
  },
  pl: {
    title: 'Integracje sklepów',
    description: 'Połącz sklepy i marketplace dla tego obszaru roboczego.',
    provider: 'Dostawca',
    storeName: 'Nazwa sklepu',
    storeUrl: 'URL sklepu',
    externalAccountId: 'Zewnętrzny ID konta',
    apiKey: 'API key / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Zapisz połączenie',
    disconnect: 'Odłącz',
    openWoo: 'Otwórz narzędzia WooCommerce',
    connected: 'Połączono',
    notConnected: 'Nie połączono',
    error: 'Błąd',
    lastSync: 'Ostatnia synchronizacja',
    neverSynced: 'Jeszcze nie synchronizowano',
    saved: 'Integracja zapisana.',
    removed: 'Integracja usunięta.',
    dbRequired: 'Najpierw uruchom Supabase SQL dla store integrations.',
    secretHint: 'Zostaw puste, aby zachować zapisany sekret.',
    serverOnly: 'Sekrety są przechowywane server-side dla każdego workspace i nigdy nie trafiają do przeglądarki.',
    setupNote: 'Dostawcy OAuth będą później wymagać server routes. Ta strona najpierw bezpiecznie zapisuje dane połączenia workspace.',
    previews: 'Zapisane dane',
    oauthConnect: 'Połącz przez OAuth',
    testOpenCart: 'Testuj OpenCart',
    exportProducts: 'Eksport produktów CSV',
    importProducts: 'Importuj produkty',
    syncProducts: 'Synchronizuj produkty',
    imported: 'Zaimportowano produkty: {count}.',
    synced: 'Zsynchronizowano: {synced}. Błędy: {failed}.',
    openConnection: 'Otwórz połączenie',
    schemaUnavailable: 'Integracje sklepów są tymczasowo niedostępne. Uruchom migrację Supabase i spróbuj ponownie.',
    issSetup: 'ISS POS wymaga oficjalnej dokumentacji API i danych dostępu, zanim Leonety będzie mogło testować lub synchronizować połączenie.',
    setupRequired: 'Wymagana konfiguracja',
    integrationGuideTitle: 'Instrukcja połączenia',
    googleLoginGuide: 'Google login konfiguruje się w Supabase Auth, nie tutaj. Utwórz Google OAuth web client, wklej Client ID i Client Secret w Supabase oraz dopuść /auth/callback dla local i production.',
    facebookLoginGuide: 'Facebook login konfiguruje się przez Supabase Auth. Utwórz Meta app, dodaj Facebook Login, wklej App ID i App Secret w Supabase i przetestuj konta testowe przed trybem live.',
    googleMapsGuide: 'Google Maps dla adresów jest oddzielne od Google login. Używaj server-side Google Maps key tylko przy ADDRESS_PROVIDER=google_maps; inaczej Leonety używa domyślnego dostawcy adresów.',
    whatsappGuide: 'WhatsApp Business nie czyta prywatnych kontaktów ani czatów. MVP to ręczny/CSV import klientów; Cloud API webhooks wymagają Meta Business setup i weryfikacji podpisu.',
    issGuide: 'ISS POS jest wyłączony, dopóki dostawca nie przekaże dokumentacji API, base URL, metody auth, endpointów produktów/stanu/sprzedaży, branch/store ID, webhooków lub polling, limitów i konta testowego.',
    credentialsNeverExposed: 'Dane dostępu trafiają tylko do server routes, są szyfrowane per workspace i pokazywane tylko jako zamaskowane metadata.',
    connectWhatsapp: 'Połącz WhatsApp Business',
    whatsappSignupRunning: 'Otwieranie Meta Embedded Signup...',
    whatsappConnected: 'WhatsApp Business połączony.',
    whatsappSetupRequired: 'Meta Embedded Signup nie jest jeszcze skonfigurowany.',
    whatsappClientMode: 'Tworzenie klientów',
    whatsappClientModeAsk: 'Pytaj przed utworzeniem',
    whatsappClientModeAuto: 'Automatycznie twórz lead',
    whatsappClientModeNever: 'Nigdy nie twórz automatycznie',
    whatsappNumber: 'Połączony numer',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Status webhooka',
    lastWebhook: 'Ostatnie zdarzenie webhook',
    noWebhookYet: 'Brak zdarzeń webhook',
  },
  fr: {
    title: 'Intégrations de boutiques',
    description: 'Connectez les boutiques et marketplaces pour cet espace de travail.',
    provider: 'Fournisseur',
    storeName: 'Nom de la boutique',
    storeUrl: 'URL de la boutique',
    externalAccountId: 'ID de compte externe',
    apiKey: 'API key / consumer key',
    apiSecret: 'API secret / consumer secret',
    merchantId: 'Merchant ID',
    accessToken: 'Access token',
    refreshToken: 'Refresh token',
    save: 'Enregistrer la connexion',
    disconnect: 'Déconnecter',
    openWoo: 'Ouvrir les outils WooCommerce',
    connected: 'Connecté',
    notConnected: 'Non connecté',
    error: 'Erreur',
    lastSync: 'Dernière synchronisation',
    neverSynced: 'Jamais synchronisé',
    saved: 'Intégration enregistrée.',
    removed: 'Intégration supprimée.',
    dbRequired: 'Exécutez d’abord le SQL Supabase pour store integrations.',
    secretHint: 'Laissez vide pour conserver le secret enregistré.',
    serverOnly: 'Les secrets sont stockés côté serveur par workspace et ne sont jamais exposés au navigateur.',
    setupNote: 'Les fournisseurs OAuth auront besoin de server routes plus tard. Cette page stocke d’abord les données de connexion du workspace.',
    previews: 'Identifiants enregistrés',
    oauthConnect: 'Connecter avec OAuth',
    testOpenCart: 'Tester OpenCart',
    exportProducts: 'Exporter les produits CSV',
    importProducts: 'Importer les produits',
    syncProducts: 'Synchroniser les produits',
    imported: 'Produits importés : {count}.',
    synced: 'Synchronisés : {synced}. Échecs : {failed}.',
    openConnection: 'Ouvrir la connexion',
    schemaUnavailable: 'Les intégrations de boutiques sont temporairement indisponibles. Exécutez la migration Supabase puis réessayez.',
    issSetup: 'ISS POS nécessite une documentation API officielle et des identifiants avant que Leonety puisse tester ou synchroniser la connexion.',
    setupRequired: 'Configuration requise',
    integrationGuideTitle: 'Guide de connexion',
    googleLoginGuide: 'Google login se configure dans Supabase Auth, pas ici. Créez un client web Google OAuth, collez Client ID et Client Secret dans Supabase et autorisez /auth/callback en local et production.',
    facebookLoginGuide: 'Facebook login se configure via Supabase Auth. Créez une app Meta, ajoutez Facebook Login, collez App ID et App Secret dans Supabase et testez avec des utilisateurs autorisés avant le mode live.',
    googleMapsGuide: 'Google Maps pour les adresses est séparé de Google login. Utilisez une clé Google Maps server-side restreinte seulement avec ADDRESS_PROVIDER=google_maps; sinon Leonety utilise le fournisseur d’adresse par défaut.',
    whatsappGuide: 'WhatsApp Business ne peut pas lire les contacts ou chats personnels. MVP : capture manuelle/CSV; les webhooks Cloud API nécessitent Meta Business setup et vérification de signature.',
    issGuide: 'ISS POS reste désactivé tant que le fournisseur ne donne pas documentation API, base URL, méthode auth, endpoints produits/stock/ventes, branch/store ID, webhooks ou polling, rate limits et compte test.',
    credentialsNeverExposed: 'Les identifiants sont envoyés uniquement aux server routes, chiffrés par workspace et affichés seulement sous forme masquée.',
    connectWhatsapp: 'Connecter WhatsApp Business',
    whatsappSignupRunning: 'Ouverture de Meta Embedded Signup...',
    whatsappConnected: 'WhatsApp Business connecté.',
    whatsappSetupRequired: 'Meta Embedded Signup n’est pas encore configuré.',
    whatsappClientMode: 'Création de clients',
    whatsappClientModeAsk: 'Demander avant de créer',
    whatsappClientModeAuto: 'Créer automatiquement un lead',
    whatsappClientModeNever: 'Ne jamais créer automatiquement',
    whatsappNumber: 'Numéro connecté',
    whatsappWaba: 'WABA ID',
    whatsappPhoneId: 'Phone Number ID',
    webhookStatus: 'Statut webhook',
    lastWebhook: 'Dernier événement webhook',
    noWebhookYet: 'Aucun événement webhook',
  },
}

function statusLabel(status: IntegrationStatus, labels: Record<string, string>) {
  if (status === 'connected') return labels.connected
  if (status === 'error') return labels.error
  if (status === 'disabled') return labels.notConnected
  return labels.notConnected
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function localizedApiError(payload: { code?: string; error?: string }, labels: Record<string, string>) {
  if (payload.code === 'STORE_INTEGRATIONS_SCHEMA_REQUIRED') return labels.schemaUnavailable
  if (payload.error?.includes('external_account_id') || payload.error?.includes('42703')) return labels.schemaUnavailable
  return payload.error ?? labels.error
}

export default function StoreIntegrationsPage() {
  const router = useRouter()
  const { currentCompany, loading } = useCompany()
  const { locale, t } = useI18n()
  const labels = copy[locale] ?? copy.en
  const [provider, setProvider] = useState<Provider>('woocommerce')
  const [form, setForm] = useState<IntegrationForm>(emptyForm)
  const [integrations, setIntegrations] = useState<StoreIntegration[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [whatsAppConnecting, setWhatsAppConnecting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const integrationRequestRef = useRef<AbortController | null>(null)
  const whatsAppSignupDataRef = useRef<Record<string, unknown>>({})
  const selectedProvider = useMemo(() => providerOptions.find((item) => item.value === provider) ?? providerOptions[0], [provider])
  const currentIntegration = integrations.find((item) => item.provider === provider)

  const loadIntegrations = useCallback(async () => {
    if (!currentCompany) {
      setLoadingIntegrations(false)
      return
    }

    integrationRequestRef.current?.abort()
    const controller = new AbortController()
    integrationRequestRef.current = controller

    setLoadingIntegrations(true)
    setError('')

    try {
      const response = await fetch(`/api/store-integrations?companyId=${encodeURIComponent(currentCompany.id)}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setIntegrations([])
        setError(localizedApiError(payload, copy.en))
      } else {
        setIntegrations((payload.integrations ?? []) as StoreIntegration[])
      }
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return
      setIntegrations([])
      setError(loadError instanceof Error ? loadError.message : copy.en.schemaUnavailable)
    } finally {
      if (integrationRequestRef.current === controller) {
        integrationRequestRef.current = null
        setLoadingIntegrations(false)
      }
    }
  }, [currentCompany])

  useEffect(() => {
    void loadIntegrations()

    return () => {
      integrationRequestRef.current?.abort()
    }
  }, [loadIntegrations])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nextMessage = params.get('message')
    const nextError = params.get('error')

    if (nextMessage) setMessage(nextMessage)
    if (nextError) setError(nextError)
  }, [])

  useEffect(() => {
    if (!currentIntegration) {
      setForm(emptyForm)
      return
    }

    setForm({
      storeName: currentIntegration.storeName,
      storeUrl: currentIntegration.storeUrl,
      externalAccountId: currentIntegration.externalAccountId,
      apiKey: '',
      apiSecret: '',
      merchantId: currentIntegration.merchantId,
      accessToken: '',
      refreshToken: '',
      clientCreationMode: (currentIntegration.metadata?.clientCreationMode === 'auto_create_lead' ||
        currentIntegration.metadata?.clientCreationMode === 'never'
        ? currentIntegration.metadata.clientCreationMode
        : 'ask') as WhatsAppClientCreationMode,
    })
  }, [currentIntegration])

  const updateForm = (field: keyof IntegrationForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return

    setSaving(true)
    setMessage('')
    setError('')

    if (provider === 'iss_pos') {
      setError(labels.issSetup)
      setSaving(false)
      return
    }

    if (provider === 'whatsapp_business') {
      setError(labels.whatsappSetupRequired)
      setSaving(false)
      return
    }

    const response = await fetch('/api/store-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: currentCompany.id,
        provider,
        ...form,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(localizedApiError(payload, labels))
    } else {
      setMessage(labels.saved)
      await loadIntegrations()
    }

    setSaving(false)
  }

  const handleDisconnect = async () => {
    if (!currentCompany) return

    setSaving(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/store-integrations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, provider }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(localizedApiError(payload, labels))
    } else {
      setMessage(labels.removed)
      await loadIntegrations()
    }

    setSaving(false)
  }

  const handleOAuthConnect = () => {
    if (!currentCompany) return
    const params = new URLSearchParams({
      companyId: currentCompany.id,
      provider,
      storeUrl: form.storeUrl,
      merchantId: form.merchantId,
    })

    window.location.href = `/api/store-integrations/oauth/start?${params.toString()}`
  }

  const handleOpenCartTest = async () => {
    if (!currentCompany) return

    setTesting(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/store-integrations/opencart/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: currentCompany.id,
        storeUrl: form.storeUrl,
        apiKey: form.apiKey || currentIntegration?.apiKeyPreview,
      }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(localizedApiError(payload, labels))
    } else {
      setMessage(payload.message ?? 'OpenCart API responded.')
    }

    setTesting(false)
  }

  const handleExportProducts = async () => {
    if (!currentCompany) return

    setExporting(true)
    setError('')

    const response = await fetch('/api/store-integrations/products/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, provider }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(localizedApiError(payload, labels))
      setExporting(false)
      return
    }

    const blob = await response.blob()
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `leonety-${provider}-products.csv`
    link.click()
    URL.revokeObjectURL(href)
    setExporting(false)
  }

  const handleImportProducts = async () => {
    if (!currentCompany) return

    setImporting(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/store-integrations/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, provider }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(localizedApiError(payload, labels))
    } else {
      setMessage(labels.imported.replace('{count}', String(payload.imported ?? 0)))
      await loadIntegrations()
    }

    setImporting(false)
  }

  const handleSyncProducts = async () => {
    if (!currentCompany) return

    setSyncing(true)
    setMessage('')
    setError('')

    const response = await fetch('/api/store-integrations/products/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: currentCompany.id, provider }),
    })
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      setError(localizedApiError(payload, labels))
    } else {
      setMessage(labels.synced
        .replace('{synced}', String(payload.synced ?? 0))
        .replace('{failed}', String(payload.failed ?? 0)))
      await loadIntegrations()
    }

    setSyncing(false)
  }

  const loadFacebookSdk = useCallback((appId: string, graphVersion: string) => {
    return new Promise<void>((resolve, reject) => {
      if (window.FB) {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion })
        resolve()
        return
      }

      const existingScript = document.getElementById('facebook-jssdk')
      window.fbAsyncInit = () => {
        window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion })
        resolve()
      }

      if (existingScript) {
        existingScript.addEventListener('load', () => {
          window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion })
          resolve()
        }, { once: true })
        existingScript.addEventListener('error', () => reject(new Error(labels.whatsappSetupRequired)), { once: true })
        return
      }

      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      script.onerror = () => reject(new Error(labels.whatsappSetupRequired))
      document.body.appendChild(script)
    })
  }, [labels.whatsappSetupRequired])

  const startWhatsAppSignup = async () => {
    if (!currentCompany || whatsAppConnecting) return

    setWhatsAppConnecting(true)
    setMessage('')
    setError('')
    whatsAppSignupDataRef.current = {}

    const handleSignupMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (payload?.type === 'WA_EMBEDDED_SIGNUP' || payload?.event === 'FINISH') {
          whatsAppSignupDataRef.current = {
            ...whatsAppSignupDataRef.current,
            ...(payload?.data ?? payload),
          }
        }
      } catch {
        // Meta sends non-JSON events as well; ignore them.
      }
    }

    window.addEventListener('message', handleSignupMessage)

    try {
      const configResponse = await fetch(`/api/store-integrations/whatsapp/embedded-signup/config?companyId=${encodeURIComponent(currentCompany.id)}`, {
        cache: 'no-store',
      })
      const config = await configResponse.json().catch(() => ({}))

      if (!configResponse.ok) {
        setError(localizedApiError(config, labels))
        return
      }

      await loadFacebookSdk(config.appId, config.graphVersion)
      setMessage(labels.whatsappSignupRunning)

      await new Promise<void>((resolve) => {
        window.FB?.login(async (response) => {
          const code = response.authResponse?.code

          if (!code) {
            setError(labels.whatsappSetupRequired)
            resolve()
            return
          }

          const completeResponse = await fetch('/api/store-integrations/whatsapp/embedded-signup/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId: currentCompany.id,
              code,
              signupData: whatsAppSignupDataRef.current,
              clientCreationMode: form.clientCreationMode,
            }),
          })
          const completePayload = await completeResponse.json().catch(() => ({}))

          if (!completeResponse.ok) {
            setError(localizedApiError(completePayload, labels))
          } else {
            setMessage(labels.whatsappConnected)
            await loadIntegrations()
          }

          resolve()
        }, {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            sessionInfoVersion: '3',
          },
        })
      })
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : labels.whatsappSetupRequired)
    } finally {
      window.removeEventListener('message', handleSignupMessage)
      setWhatsAppConnecting(false)
    }
  }

  if (loading || loadingIntegrations) {
    return <PageContainer><PageHeader title={labels.title} description={labels.description} /></PageContainer>
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={labels.title} />
        <EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={labels.title} description={`${labels.description} · ${currentCompany.name}`} />

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{labels.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{labels.provider}</span>
                <AppSelect
                  value={provider}
                  onChange={(value) => setProvider(value as Provider)}
                  options={providerOptions.map((item) => ({ value: item.value, label: item.label }))}
                />
              </label>

              <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                <p>{labels.serverOnly}</p>
                <p className="mt-1">{labels.setupNote}</p>
                {provider === 'whatsapp_business' && <p className="mt-2 font-medium">{labels.whatsappGuide}</p>}
                {provider === 'iss_pos' && <p className="mt-2 font-medium">{labels.issSetup}</p>}
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <h3 className="font-semibold text-slate-950">{labels.integrationGuideTitle}</h3>
                <p className="mt-2">{labels.credentialsNeverExposed}</p>
                <div className="mt-3 grid gap-3">
                  <p><span className="font-medium">{t('integrations.googleLogin')}:</span> {labels.googleLoginGuide}</p>
                  <p><span className="font-medium">{t('integrations.facebookLogin')}:</span> {labels.facebookLoginGuide}</p>
                  <p><span className="font-medium">{t('integrations.googleMaps')}:</span> {labels.googleMapsGuide}</p>
                  <p><span className="font-medium">{t('integrations.whatsappBusiness')}:</span> {labels.whatsappGuide}</p>
                  <p><span className="font-medium">ISS POS:</span> {labels.issGuide}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {provider === 'whatsapp_business' && (
                  <label className="block space-y-1 md:col-span-2">
                    <span className="text-sm font-medium">{labels.whatsappClientMode}</span>
                    <AppSelect
                      value={form.clientCreationMode}
                      onChange={(value) => updateForm('clientCreationMode', value)}
                      options={[
                        { value: 'ask', label: labels.whatsappClientModeAsk },
                        { value: 'auto_create_lead', label: labels.whatsappClientModeAuto },
                        { value: 'never', label: labels.whatsappClientModeNever },
                      ]}
                    />
                  </label>
                )}
                {selectedProvider.fields.includes('storeName') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.storeName}</span>
                    <input value={form.storeName} onChange={(event) => updateForm('storeName', event.target.value)} className="w-full rounded-md border px-3 py-2" />
                  </label>
                )}
                {selectedProvider.fields.includes('storeUrl') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.storeUrl}</span>
                    <input value={form.storeUrl} onChange={(event) => updateForm('storeUrl', event.target.value)} placeholder="https://example.com" className="w-full rounded-md border px-3 py-2" />
                  </label>
                )}
                {selectedProvider.fields.includes('externalAccountId') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.externalAccountId}</span>
                    <input value={form.externalAccountId} onChange={(event) => updateForm('externalAccountId', event.target.value)} className="w-full rounded-md border px-3 py-2" />
                  </label>
                )}
                {selectedProvider.fields.includes('merchantId') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.merchantId}</span>
                    <input value={form.merchantId} onChange={(event) => updateForm('merchantId', event.target.value)} className="w-full rounded-md border px-3 py-2" />
                  </label>
                )}
                {selectedProvider.fields.includes('apiKey') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.apiKey}</span>
                    <input value={form.apiKey} onChange={(event) => updateForm('apiKey', event.target.value)} placeholder={currentIntegration ? labels.secretHint : ''} className="w-full rounded-md border px-3 py-2" autoComplete="off" />
                  </label>
                )}
                {selectedProvider.fields.includes('apiSecret') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.apiSecret}</span>
                    <input type="password" value={form.apiSecret} onChange={(event) => updateForm('apiSecret', event.target.value)} placeholder={currentIntegration ? labels.secretHint : ''} className="w-full rounded-md border px-3 py-2" autoComplete="new-password" />
                  </label>
                )}
                {selectedProvider.fields.includes('accessToken') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.accessToken}</span>
                    <input type="password" value={form.accessToken} onChange={(event) => updateForm('accessToken', event.target.value)} placeholder={currentIntegration ? labels.secretHint : ''} className="w-full rounded-md border px-3 py-2" autoComplete="new-password" />
                  </label>
                )}
                {selectedProvider.fields.includes('refreshToken') && (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">{labels.refreshToken}</span>
                    <input type="password" value={form.refreshToken} onChange={(event) => updateForm('refreshToken', event.target.value)} placeholder={currentIntegration ? labels.secretHint : ''} className="w-full rounded-md border px-3 py-2" autoComplete="new-password" />
                  </label>
                )}
              </div>

              {currentIntegration && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="mb-2 font-medium text-slate-950">{labels.previews}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {provider === 'whatsapp_business' && (
                      <>
                        <p>{labels.whatsappNumber}: {String(currentIntegration.metadata?.displayPhoneNumber ?? currentIntegration.storeName ?? '-')}</p>
                        <p>{labels.whatsappWaba}: {currentIntegration.externalAccountId || '-'}</p>
                        <p>{labels.whatsappPhoneId}: {currentIntegration.merchantId || '-'}</p>
                        <p>{labels.lastWebhook}: {formatDate(currentIntegration.lastWebhookAt, locale) || labels.noWebhookYet}</p>
                      </>
                    )}
                    {currentIntegration.apiKeyPreview && <p><KeyRound className="mr-1 inline h-3.5 w-3.5" />{labels.apiKey}: {currentIntegration.apiKeyPreview}</p>}
                    {currentIntegration.apiSecretPreview && <p><KeyRound className="mr-1 inline h-3.5 w-3.5" />{labels.apiSecret}: {currentIntegration.apiSecretPreview}</p>}
                    {currentIntegration.accessTokenPreview && <p><KeyRound className="mr-1 inline h-3.5 w-3.5" />{labels.accessToken}: {currentIntegration.accessTokenPreview}</p>}
                    {currentIntegration.refreshTokenPreview && <p><KeyRound className="mr-1 inline h-3.5 w-3.5" />{labels.refreshToken}: {currentIntegration.refreshTokenPreview}</p>}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {provider !== 'whatsapp_business' && (
                  <Button type="submit" disabled={saving}>{saving ? t('common.loading') : labels.save}</Button>
                )}
                {provider === 'whatsapp_business' && (
                  <Button type="button" disabled={whatsAppConnecting || saving} onClick={startWhatsAppSignup}>
                    {whatsAppConnecting ? t('common.loading') : labels.connectWhatsapp}
                  </Button>
                )}
                {provider === 'shopify' || provider === 'google_merchant' ? (
                  <Button type="button" variant="outline" disabled={saving} onClick={handleOAuthConnect}>{labels.oauthConnect}</Button>
                ) : null}
                {provider === 'opencart' && (
                  <Button type="button" variant="outline" disabled={testing || saving} onClick={handleOpenCartTest}>{testing ? t('common.loading') : labels.testOpenCart}</Button>
                )}
                {provider === 'iss_pos' && (
                  <Button type="button" variant="outline" disabled>{labels.issSetup}</Button>
                )}
                {provider !== 'whatsapp_business' && provider !== 'iss_pos' && (
                  <Button type="button" variant="outline" disabled={exporting} onClick={handleExportProducts}>
                    {exporting ? t('common.loading') : labels.exportProducts}
                  </Button>
                )}
                {provider === 'shopify' && (
                  <Button type="button" variant="outline" disabled={importing || !currentIntegration} onClick={handleImportProducts}>
                    {importing ? t('common.loading') : labels.importProducts}
                  </Button>
                )}
                {(provider === 'shopify' || provider === 'google_merchant') && (
                  <Button type="button" variant="outline" disabled={syncing || !currentIntegration} onClick={handleSyncProducts}>
                    {syncing ? t('common.loading') : labels.syncProducts}
                  </Button>
                )}
                {currentIntegration && (
                  <Button type="button" variant="outline" disabled={saving} onClick={handleDisconnect}>{labels.disconnect}</Button>
                )}
                {selectedProvider.directSettings && (
                  <Link href={selectedProvider.directSettings}>
                    <Button type="button" variant="outline">{labels.openWoo}</Button>
                  </Link>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {providerOptions.map((item) => {
            const integration = integrations.find((row) => row.provider === item.value)
            const status = integration?.status ?? 'not_connected'

            return (
              <Card key={item.value}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Store className="mb-3 h-5 w-5 text-slate-500" />
                      <h2 className="font-semibold text-slate-950">{item.label}</h2>
                      <p className="mt-1 text-sm text-slate-500">{integration?.storeName || integration?.storeUrl || integration?.merchantId || '-'}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {labels.lastSync}: {formatDate(integration?.lastSyncAt ?? null, locale) || labels.neverSynced}
                      </p>
                      {integration && (
                        <Link href={`/app/settings/integrations/${encodeURIComponent(integration.id)}`} className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700">
                          {labels.openConnection}
                        </Link>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                      status === 'connected'
                        ? 'bg-green-100 text-green-700'
                        : status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {status === 'connected' ? <Plug className="h-3.5 w-3.5" /> : <Unplug className="h-3.5 w-3.5" />}
                      {statusLabel(status, labels)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </PageContainer>
  )
}
