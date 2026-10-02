const INSTALLATION_KEY = 'leonety-push-installation-id'
const LEGACY_ORDER_INSTALLATION_KEY = 'leonety-order-alert-installation-id'

export interface WebPushCapability {
  supported: boolean
  iosInstallRequired: boolean
  secureContextRequired: boolean
}

export type WebPushViewStatus =
  | 'checking'
  | 'notEnabled'
  | 'permissionRequired'
  | 'subscriptionMissing'
  | 'enabled'
  | 'blocked'
  | 'unsupported'
  | 'installationRequired'
  | 'serverConfigurationMissing'
  | 'error'

export function resolveWebPushViewStatus({
  capability,
  permission,
  browserSubscribed,
  subscriptionMatches,
  serverStatus,
  serverConfigured = true,
  loadFailed = false,
}: {
  capability: WebPushCapability | null
  permission: NotificationPermission
  browserSubscribed: boolean
  subscriptionMatches?: boolean
  serverStatus?: 'enabled' | 'invalid' | 'disabled'
  serverConfigured?: boolean
  loadFailed?: boolean
}): WebPushViewStatus {
  if (!capability) return 'checking'
  if (capability?.iosInstallRequired) return 'installationRequired'
  if (!capability.supported) return 'unsupported'
  if (permission === 'denied') return 'blocked'
  if (!serverConfigured) return 'serverConfigurationMissing'
  if (loadFailed || serverStatus === 'invalid') return 'error'
  if (permission === 'granted' && browserSubscribed && serverStatus === 'enabled' && subscriptionMatches !== false) return 'enabled'
  if (permission === 'default') return 'permissionRequired'
  if (permission === 'granted' && !browserSubscribed) return 'subscriptionMissing'
  if (permission === 'granted' && browserSubscribed && subscriptionMatches === false) return 'subscriptionMissing'
  if (permission === 'granted' && browserSubscribed && !serverStatus) return 'subscriptionMissing'
  return 'notEnabled'
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)
}

function getIosVersion() {
  const userAgent = window.navigator.userAgent
  const osVersion = userAgent.match(/OS (\d+)[._](\d+)/i)
  const safariVersion = userAgent.match(/Version\/(\d+)\.(\d+)/i)
  const match = osVersion ?? safariVersion
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

function iosSupportsInstalledWebPush() {
  const version = getIosVersion()
  if (!version) return true
  return version.major > 16 || (version.major === 16 && version.minor >= 4)
}

export function getWebPushCapability(): WebPushCapability {
  const secureContextRequired = !window.isSecureContext
  const iosDevice = isIosDevice()
  const iosInstallRequired = !secureContextRequired
    && iosDevice
    && iosSupportsInstalledWebPush()
    && !isStandalone()
  const supported = !iosInstallRequired
    && !secureContextRequired
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window

  return {
    supported,
    secureContextRequired,
    iosInstallRequired,
  }
}

export function getPushInstallationId() {
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(INSTALLATION_KEY)
      ?? window.localStorage.getItem(LEGACY_ORDER_INSTALLATION_KEY)
  } catch {
    // A device can still use the page when browser storage is unavailable.
  }

  if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) {
    try { window.localStorage.setItem(INSTALLATION_KEY, saved) } catch { /* Keep the existing id in memory. */ }
    return saved
  }

  const installationId = crypto.randomUUID()
  try { window.localStorage.setItem(INSTALLATION_KEY, installationId) } catch { /* Registration remains usable for this page session. */ }
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

export async function getPushSubscriptionFingerprint(subscription: PushSubscription | null) {
  if (!subscription || !window.crypto?.subtle) return ''
  const bytes = new TextEncoder().encode(subscription.endpoint)
  const digest = await window.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function unsubscribeCurrentPushSubscription() {
  const subscription = await getCurrentPushSubscription()
  if (!subscription) return true
  return subscription.unsubscribe()
}

export async function createCurrentPushSubscription(vapidPublicKey: string, forceNew = false) {
  const expectedKey = base64UrlToBytes(vapidPublicKey)
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  if (existing && !forceNew && keysMatch(existing.options.applicationServerKey, expectedKey)) return existing
  if (existing) await existing.unsubscribe()

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey,
  })
}
