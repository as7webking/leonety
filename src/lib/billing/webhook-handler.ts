import 'server-only'
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-admin'
import { getPlanFromProviderPriceId, getProviderApiKey, getWebhookSecret } from './server-config'
import { isBillingProvider, type BillingProvider, type PaidAppPlan } from './plans'

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'
type JsonRecord = Record<string, unknown>

interface NormalizedSubscription {
  companyId: string
  userId: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string
  providerPriceId: string | null
  plan: PaidAppPlan
  status: SubscriptionStatus
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  customerEmail: string | null
}

interface NormalizedPayment {
  companyId: string
  providerPaymentId: string
  amount: number
  currency: string
  status: PaymentStatus
  paidAt: string | null
}

function jsonError(message: string, status: number, requestId: string) {
  return NextResponse.json({ error: message, requestId }, { status })
}

function safeLog(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown>) {
  console[level](`[billing.webhook] ${message}`, meta)
}

function toIsoFromUnix(value: unknown) {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function getStripeSignatureParts(header: string) {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...value] = part.split('=')
      return [key, value.join('=')]
    })
  )
  return { timestamp: parts.t, signature: parts.v1 }
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false

  const { timestamp, signature } = getStripeSignatureParts(signatureHeader)
  if (!timestamp || !signature) return false

  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds)
  if (ageSeconds > 300) return false

  const signedPayload = `${timestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return timingSafeEqual(expected, signature)
}

function parsePaddleSignature(header: string) {
  const values = Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...value] = part.trim().split('=')
      return [key, value.join('=')]
    })
  )

  return { timestamp: values.ts, signature: values.h1 }
}

function verifyPaddleSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false

  const { timestamp, signature } = parsePaddleSignature(signatureHeader)
  if (!timestamp || !signature) return false

  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds)
  if (ageSeconds > 300) return false

  const signedPayload = `${timestamp}:${rawBody}`
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex')
  return timingSafeEqual(expected, signature)
}

function verifyWebhookSignature(provider: BillingProvider, request: Request, rawBody: string, secret: string) {
  if (provider === 'stripe') {
    return verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret)
  }

  return verifyPaddleSignature(rawBody, request.headers.get('paddle-signature'), secret)
}

function mapStripeStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'incomplete_expired':
      return 'expired'
    default:
      return 'past_due'
  }
}

function mapPaddleStatus(status: string | undefined): SubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'expired'
  }
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function objectOrNull(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function getObject(record: JsonRecord, key: string) {
  return objectOrNull(record[key])
}

function getFirstStripePriceId(subscription: JsonRecord) {
  const items = getObject(subscription, 'items')
  const data = Array.isArray(items?.data) ? items.data : []
  const firstItem = objectOrNull(data[0])
  const price = firstItem ? getObject(firstItem, 'price') : null
  return stringOrNull(price?.id)
}

function normalizeStripeSubscription(subscription: JsonRecord, fallbackMetadata: JsonRecord = {}): NormalizedSubscription | null {
  const subscriptionMetadata = objectOrNull(subscription.metadata) ?? {}
  const metadata = {
    ...fallbackMetadata,
    ...subscriptionMetadata,
  }
  const providerPriceId = getFirstStripePriceId(subscription)
  const plan = getPlanFromProviderPriceId('stripe', providerPriceId)
  const companyId = stringOrNull(metadata.company_id)
  const providerSubscriptionId = stringOrNull(subscription.id)

  if (!companyId || !providerSubscriptionId || !plan) return null

  return {
    companyId,
    userId: stringOrNull(metadata.user_id),
    providerCustomerId: stringOrNull(subscription.customer),
    providerSubscriptionId,
    providerPriceId,
    plan,
    status: mapStripeStatus(stringOrNull(subscription.status) ?? undefined),
    currentPeriodStart: toIsoFromUnix(subscription.current_period_start),
    currentPeriodEnd: toIsoFromUnix(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    customerEmail: stringOrNull(subscription.customer_email),
  }
}

function normalizePaddleSubscription(subscription: JsonRecord): NormalizedSubscription | null {
  const customData = objectOrNull(subscription.custom_data) ?? {}
  const firstItem = Array.isArray(subscription.items) ? objectOrNull(subscription.items[0]) : null
  const price = firstItem ? getObject(firstItem, 'price') : null
  const billingPeriod = getObject(subscription, 'current_billing_period')
  const scheduledChange = getObject(subscription, 'scheduled_change')
  const providerPriceId = stringOrNull(price?.id ?? firstItem?.price_id)
  const plan = getPlanFromProviderPriceId('paddle', providerPriceId)
  const companyId = stringOrNull(customData.company_id)
  const providerSubscriptionId = stringOrNull(subscription.id)

  if (!companyId || !providerSubscriptionId || !plan) return null

  return {
    companyId,
    userId: stringOrNull(customData.user_id),
    providerCustomerId: stringOrNull(subscription.customer_id),
    providerSubscriptionId,
    providerPriceId,
    plan,
    status: mapPaddleStatus(stringOrNull(subscription.status) ?? undefined),
    currentPeriodStart: stringOrNull(billingPeriod?.starts_at),
    currentPeriodEnd: stringOrNull(billingPeriod?.ends_at),
    cancelAtPeriodEnd: scheduledChange?.action === 'cancel',
    customerEmail: null,
  }
}

function normalizeStripePayment(invoice: JsonRecord): NormalizedPayment | null {
  const subscriptionDetails = getObject(invoice, 'subscription_details')
  const metadata = objectOrNull(subscriptionDetails?.metadata) ?? objectOrNull(invoice.metadata) ?? {}
  const statusTransitions = getObject(invoice, 'status_transitions')
  const companyId = stringOrNull(metadata.company_id)
  const providerPaymentId = stringOrNull(invoice.payment_intent ?? invoice.id)
  const amount = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : typeof invoice.amount_due === 'number' ? invoice.amount_due : null
  const currency = stringOrNull(invoice.currency)?.toUpperCase()

  if (!companyId || !providerPaymentId || amount === null || !currency) return null

  return {
    companyId,
    providerPaymentId,
    amount,
    currency,
    status: invoice.paid === true ? 'paid' : 'failed',
    paidAt: toIsoFromUnix(statusTransitions?.paid_at) ?? toIsoFromUnix(invoice.created),
  }
}

async function fetchStripeSubscription(subscriptionId: string) {
  const apiKey = getProviderApiKey('stripe')
  if (!apiKey) return null

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) return null
  return await response.json().catch(() => null) as JsonRecord | null
}

async function upsertCustomer(provider: BillingProvider, subscription: NormalizedSubscription) {
  if (!subscription.providerCustomerId || !subscription.userId) return

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('billing_customers')
    .upsert({
      user_id: subscription.userId,
      company_id: subscription.companyId,
      provider,
      provider_customer_id: subscription.providerCustomerId,
      email: subscription.customerEmail,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'provider,provider_customer_id',
    })

  if (error) throw error
}

async function getBillingCustomerId(provider: BillingProvider, providerCustomerId: string | null) {
  if (!providerCustomerId) return null

  const supabase = createSupabaseAdminClient()
  const { data } = await supabase
    .from('billing_customers')
    .select('id')
    .eq('provider', provider)
    .eq('provider_customer_id', providerCustomerId)
    .maybeSingle<{ id: string }>()

  return data?.id ?? null
}

async function upsertSubscription(provider: BillingProvider, subscription: NormalizedSubscription) {
  await upsertCustomer(provider, subscription)

  const billingCustomerId = await getBillingCustomerId(provider, subscription.providerCustomerId)
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('billing_subscriptions')
    .upsert({
      company_id: subscription.companyId,
      billing_customer_id: billingCustomerId,
      provider,
      provider_subscription_id: subscription.providerSubscriptionId,
      provider_price_id: subscription.providerPriceId,
      plan: subscription.plan,
      status: subscription.status,
      current_period_start: subscription.currentPeriodStart,
      current_period_end: subscription.currentPeriodEnd,
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'provider,provider_subscription_id',
    })

  if (error) throw error
}

async function insertPayment(provider: BillingProvider, payment: NormalizedPayment) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('billing_payments')
    .upsert({
      company_id: payment.companyId,
      provider,
      provider_payment_id: payment.providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paid_at: payment.paidAt,
    }, {
      onConflict: 'provider,provider_payment_id',
    })

  if (error) throw error
}

async function markEventProcessed(provider: BillingProvider, eventId: string, patch: Record<string, unknown>) {
  const supabase = createSupabaseAdminClient()
  await supabase
    .from('billing_events')
    .update({
      ...patch,
      processed_at: new Date().toISOString(),
    })
    .eq('provider', provider)
    .eq('provider_event_id', eventId)
}

async function markEventFailed(provider: BillingProvider, eventId: string, message: string) {
  const supabase = createSupabaseAdminClient()
  await supabase
    .from('billing_events')
    .update({
      processing_error: message.slice(0, 500),
    })
    .eq('provider', provider)
    .eq('provider_event_id', eventId)
}

async function insertEventLock(provider: BillingProvider, eventId: string, eventType: string, requestId: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('billing_events')
    .insert({
      provider,
      provider_event_id: eventId,
      event_type: eventType,
      payload: {
        request_id: requestId,
        stored: 'minimal',
      },
    })

  if (!error) return 'inserted' as const
  if (error.code === '23505') {
    const { data } = await supabase
      .from('billing_events')
      .select('processed_at')
      .eq('provider', provider)
      .eq('provider_event_id', eventId)
      .maybeSingle<{ processed_at: string | null }>()

    return data?.processed_at ? 'duplicate_processed' as const : 'duplicate_unprocessed' as const
  }
  throw error
}

async function processStripeEvent(event: JsonRecord, requestId: string) {
  const eventType = stringOrNull(event.type) ?? ''
  const data = getObject(event, 'data')
  const object = data ? getObject(data, 'object') : null

  if (!object) {
    safeLog('warn', 'Stripe event missing data object', { requestId, eventType })
    return
  }

  if (eventType === 'checkout.session.completed') {
    const subscriptionId = stringOrNull(object.subscription)
    if (!subscriptionId) return

    const subscription = await fetchStripeSubscription(subscriptionId)
    const normalized = subscription ? normalizeStripeSubscription(subscription, objectOrNull(object.metadata) ?? {}) : null
    if (!normalized) {
      safeLog('warn', 'Could not normalize checkout subscription', { requestId, eventType })
      return
    }

    await upsertSubscription('stripe', normalized)
    return
  }

  if (eventType.startsWith('customer.subscription.')) {
    const normalized = normalizeStripeSubscription(object)
    if (!normalized) {
      safeLog('warn', 'Could not normalize Stripe subscription', { requestId, eventType })
      return
    }

    await upsertSubscription('stripe', normalized)
    return
  }

  if (eventType === 'invoice.payment_succeeded' || eventType === 'invoice.payment_failed') {
    const payment = normalizeStripePayment(object)
    if (payment) {
      await insertPayment('stripe', payment)
    }
  }
}

async function processPaddleEvent(event: JsonRecord, requestId: string) {
  const eventType = stringOrNull(event.event_type) ?? ''
  const object = objectOrNull(event.data)

  if (!object) {
    safeLog('warn', 'Paddle event missing data object', { requestId, eventType })
    return
  }

  if (eventType.startsWith('subscription.')) {
    const normalized = normalizePaddleSubscription(object)
    if (!normalized) {
      safeLog('warn', 'Could not normalize Paddle subscription', { requestId, eventType })
      return
    }

    await upsertSubscription('paddle', normalized)
  }
}

export async function handleBillingWebhook(request: Request, providerParam?: string) {
  const requestId = crypto.randomUUID()
  const provider = isBillingProvider(providerParam) ? providerParam : null
  let currentEventId: string | null = null

  if (!provider) {
    return jsonError('Unsupported billing provider', 404, requestId)
  }

  try {
    const secret = getWebhookSecret(provider)
    if (!secret) {
      safeLog('error', 'Webhook secret missing', { requestId, provider })
      return jsonError('Billing webhook is not configured', 500, requestId)
    }

    const rawBody = await request.text()
    if (!verifyWebhookSignature(provider, request, rawBody, secret)) {
      safeLog('warn', 'Invalid webhook signature', { requestId, provider })
      return jsonError('Invalid webhook signature', 401, requestId)
    }

    const parsedEvent = JSON.parse(rawBody) as unknown
    const event = objectOrNull(parsedEvent)
    if (!event) {
      return jsonError('Invalid webhook payload', 400, requestId)
    }
    const eventId = provider === 'stripe'
      ? stringOrNull(event.id)
      : stringOrNull(event.event_id ?? event.notification_id)
    const eventType = provider === 'stripe'
      ? stringOrNull(event.type)
      : stringOrNull(event.event_type)

    if (!eventId || !eventType) {
      return jsonError('Invalid webhook payload', 400, requestId)
    }
    currentEventId = eventId

    const lockState = await insertEventLock(provider, eventId, eventType, requestId)
    if (lockState === 'duplicate_processed') {
      safeLog('info', 'Duplicate webhook ignored', { requestId, provider, eventId, eventType })
      return NextResponse.json({ received: true, duplicate: true, requestId })
    }

    if (provider === 'stripe') {
      await processStripeEvent(event, requestId)
    } else {
      await processPaddleEvent(event, requestId)
    }

    await markEventProcessed(provider, eventId, {
      processing_error: null,
    })

    safeLog('info', 'Webhook processed', { requestId, provider, eventId, eventType })
    return NextResponse.json({ received: true, requestId })
  } catch (error) {
    if (provider && currentEventId) {
      await markEventFailed(
        provider,
        currentEventId,
        error instanceof Error ? error.message : 'Unknown error'
      ).catch(() => undefined)
    }

    safeLog('error', 'Webhook processing failed', {
      requestId,
      provider,
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return jsonError('Webhook processing failed', 500, requestId)
  }
}
