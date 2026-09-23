const INSTALLATION_KEY = 'leonety-push-installation-id'
const LEGACY_ORDER_INSTALLATION_KEY = 'leonety-order-alert-installation-id'

export interface WebPushCapability {
  supported: boolean
  iosInstallRequired: boolean
  secureContextRequired: boolean
}

export type WebPushViewStatus = 'notEnabled' | 'permissionRequired' | 'enabled' | 'blocked' | 'unsupported'

export function resolveWebPushViewStatus({
  capability,
  permission,
  browserSubscribed,
  serverStatus,
}: {
  capability: WebPushCapability | null
  permission: NotificationPermission
  browserSubscribed: boolean
  serverStatus?: 'enabled' | 'invalid' | 'disabled'
}): WebPushViewStatus {
  if (!capability?.supported || capability.iosInstallRequired) return 'unsupported'
  if (permission === 'denied') return 'blocked'
  if (permission === 'granted' && browserSubscribed && serverStatus === 'enabled') return 'enabled'
  if (permission === 'default') return 'permissionRequired'
  return 'notEnabled'
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)
}

export function getWebPushCapability(): WebPushCapability {
  const secureContextRequired = !window.isSecureContext
  const supported = !secureContextRequired
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  return {
    supported,
    secureContextRequired,
    iosInstallRequired: supported && isIosDevice() && !isStandalone(),
  }
}

export function getPushInstallationId() {
  const saved = window.localStorage.getItem(INSTALLATION_KEY)
    ?? window.localStorage.getItem(LEGACY_ORDER_INSTALLATION_KEY)

  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
    window.localStorage.setItem(INSTALLATION_KEY, saved)
    return saved
  }

  const installationId = crypto.randomUUID()
  window.localStorage.setItem(INSTALLATION_KEY, installationId)
  return installationId
}

export function detectDevicePlatform() {
  const userAgent = window.navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(userAgent)) return 'iOS/iPadOS'
  if (/android/.test(userAgent)) return 'Android'
  if (/mac/.test(userAgent)) return 'macOS'
  if (/windows/.test(userAgent)) return 'Windows'
  return 'Web browser'
}

function base64UrlToBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function keysMatch(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false
  const currentBytes = new Uint8Array(current)
  return currentBytes.length === expected.length
    && currentBytes.every((value, index) => value === expected[index])
}

export async function getCurrentPushSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration?.pushManager.getSubscription() ?? null
}

export async function createCurrentPushSubscription(vapidPublicKey: string) {
  const expectedKey = base64UrlToBytes(vapidPublicKey)
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  if (existing && keysMatch(existing.options.applicationServerKey, expectedKey)) return existing
  if (existing) await existing.unsubscribe()

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  })
}
