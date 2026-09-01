import 'server-only'
import type { BillingProvider, PaidAppPlan } from './plans'

interface ProviderPriceConfig {
  starter?: string
  pro?: string
  business?: string
}

const stripePrices: ProviderPriceConfig = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
}

const paddlePrices: ProviderPriceConfig = {
  starter: process.env.PADDLE_STARTER_PRICE_ID,
  pro: process.env.PADDLE_PRO_PRICE_ID,
  business: process.env.PADDLE_BUSINESS_PRICE_ID,
}

export function getConfiguredBillingProvider(): BillingProvider {
  const provider = process.env.BILLING_PROVIDER?.trim().toLowerCase()
  return provider === 'stripe' ? 'stripe' : 'paddle'
}

export function getProviderApiKey(provider: BillingProvider) {
  return provider === 'stripe'
    ? process.env.STRIPE_SECRET_KEY?.trim()
    : process.env.PADDLE_API_KEY?.trim()
}

export function getWebhookSecret(provider: BillingProvider) {
  return provider === 'stripe'
    ? process.env.STRIPE_WEBHOOK_SECRET?.trim()
    : process.env.PADDLE_WEBHOOK_SECRET?.trim()
}

export function getProviderPriceId(provider: BillingProvider, plan: PaidAppPlan) {
  const prices = provider === 'stripe' ? stripePrices : paddlePrices
  return prices[plan]?.trim() || null
}

export function getPlanFromProviderPriceId(provider: BillingProvider, priceId: string | null | undefined): PaidAppPlan | null {
  if (!priceId) return null

  const prices = provider === 'stripe' ? stripePrices : paddlePrices
  const entries = Object.entries(prices) as Array<[PaidAppPlan, string | undefined]>
  return entries.find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId)?.[0] ?? null
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
    || (process.env.NODE_ENV === 'production' ? 'https://leonety.vercel.app' : 'http://localhost:3000')
}

export function getPaddleApiBaseUrl() {
  const environment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase()
  if (environment === 'sandbox') return 'https://sandbox-api.paddle.com'
  if (environment === 'production') return 'https://api.paddle.com'

  const apiKey = process.env.PADDLE_API_KEY?.trim().toLowerCase() ?? ''
  return apiKey.includes('sandbox') || apiKey.includes('sdbx')
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com'
}
