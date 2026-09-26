export type OrderEventProvider = 'woocommerce'

export interface OrderCreatedEvent {
  type: 'order.created'
  workspaceId: string
  provider: OrderEventProvider
  externalOrderId: string
  createdAt: string
  providerDeliveryId: string | null
  display: {
    orderNumber: string
    amount: string
    currency: string
  }
}

export function createOrderCreatedEvent(input: Omit<OrderCreatedEvent, 'type' | 'createdAt'> & { createdAt?: string }): OrderCreatedEvent {
  return {
    type: 'order.created',
    workspaceId: input.workspaceId,
    provider: input.provider,
    externalOrderId: input.externalOrderId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    providerDeliveryId: input.providerDeliveryId,
    display: input.display,
  }
}

export function isDuplicateOrderEventError(error: { code?: string } | null | undefined) {
  return error?.code === '23505'
}
