'use client'

export type OfflineFormDraftKind = 'income' | 'expense' | 'contract'
export type OfflineDraftKind = OfflineFormDraftKind | 'invoice'

export interface OfflineDraft<T = Record<string, unknown>> {
  key: string
  kind: OfflineFormDraftKind
  userId: string
  workspaceId: string
  payload: T
  createdAt: string
  updatedAt: string
}

export interface OfflineInvoiceDraft {
  key: string
  kind: 'invoice'
  userId: string
  workspaceId: string
  payload: OfflineInvoiceDraftPayload
  createdAt: string
  updatedAt: string
  localId: string
}

export interface OfflineInvoiceDraftPayload {
  clientId: string
  clientName: string
  quickClient: { id: string; name: string; phone: string; interestedIn: string }
  items: Array<{ id: string; description: string; quantity: number; unit_price: number; tax_rate: number }>
  issueDate: string
  dueDate: string
  currency: string
  taxCountry: string
  taxType: string
  notes: string
}

const DATABASE_NAME = 'leonety-offline-v1'
const DATABASE_VERSION = 2
const DRAFT_STORE = 'drafts'
const INVOICE_DRAFT_STORE = 'invoiceDrafts'
const MAX_DRAFT_BYTES = 512 * 1024
const MAX_LOCAL_INVOICE_DRAFTS_PER_WORKSPACE = 20

function requireIndexedDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('offline_storage_unavailable')
  }
  return window.indexedDB
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(new Error('offline_storage_unavailable'))
    request.onblocked = () => reject(new Error('offline_storage_unavailable'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        const store = database.createObjectStore(DRAFT_STORE, { keyPath: 'key' })
        store.createIndex('by_user', 'userId', { unique: false })
        store.createIndex('by_user_workspace', ['userId', 'workspaceId'], { unique: false })
      }
      if (!database.objectStoreNames.contains(INVOICE_DRAFT_STORE)) {
        const store = database.createObjectStore(INVOICE_DRAFT_STORE, { keyPath: 'key' })
        store.createIndex('by_user', 'userId', { unique: false })
        store.createIndex('by_user_workspace', ['userId', 'workspaceId'], { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function runRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, mode)
    const request = operation(transaction.objectStore(DRAFT_STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('offline_storage_unavailable'))
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  }))
}

export function buildOfflineDraftKey(userId: string, workspaceId: string, kind: OfflineFormDraftKind) {
  return `${userId}:${workspaceId}:${kind}:new`
}

export function buildOfflineInvoiceDraftKey(userId: string, workspaceId: string, localId: string) {
  return `${userId}:${workspaceId}:invoice:${localId}`
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sanitizeParty(value: unknown) {
  const party = safeObject(value)
  return {
    name: text(party.name),
    company: text(party.company),
    address: text(party.address),
    email: text(party.email),
    phone: text(party.phone),
    representative: text(party.representative),
    country: text(party.country),
  }
}

function sanitizeContractDocument(value: unknown) {
  const document = safeObject(value)
  const clauses = Array.isArray(document.clauses) ? document.clauses : []
  return {
    title: text(document.title),
    introduction: text(document.introduction),
    clauses: clauses.map((value, index) => {
      const clause = safeObject(value)
      return {
        id: text(clause.id) || `local-clause-${index + 1}`,
        heading: text(clause.heading),
        body: text(clause.body),
      }
    }),
    closing: text(document.closing),
  }
}

export function sanitizeOfflineDraftPayload(kind: OfflineFormDraftKind, value: unknown): Record<string, unknown> {
  const payload = safeObject(value)

  if (kind === 'income') {
    return {
      amount: text(payload.amount),
      title: text(payload.title),
      description: text(payload.description),
      category: text(payload.category),
      customCategory: text(payload.customCategory),
      reference: text(payload.reference),
      note: text(payload.note),
      client_id: text(payload.client_id),
      invoice_id: text(payload.invoice_id),
      payment_method: text(payload.payment_method),
      date: text(payload.date),
      currency: text(payload.currency),
    }
  }

  if (kind === 'expense') {
    return {
      amount: text(payload.amount),
      title: text(payload.title),
      description: text(payload.description),
      category: text(payload.category),
      customCategory: text(payload.customCategory),
      date: text(payload.date),
      currency: text(payload.currency),
    }
  }

  return {
    clientId: text(payload.clientId),
    templateId: text(payload.templateId),
    contractLanguage: text(payload.contractLanguage),
    title: text(payload.title),
    status: 'draft',
    partyA: sanitizeParty(payload.partyA),
    partyB: sanitizeParty(payload.partyB),
    terms: safeObject(payload.terms),
    document: sanitizeContractDocument(payload.document),
  }
}

export function sanitizeOfflineInvoiceDraftPayload(value: unknown): OfflineInvoiceDraftPayload {
  const payload = safeObject(value)
  const quickClient = safeObject(payload.quickClient)
  const rawItems = Array.isArray(payload.items) ? payload.items : []
  return {
    clientId: text(payload.clientId),
    clientName: text(payload.clientName),
    quickClient: {
      id: text(quickClient.id),
      name: text(quickClient.name),
      phone: text(quickClient.phone),
      interestedIn: text(quickClient.interestedIn),
    },
    items: rawItems.slice(0, 200).map((value, index) => {
      const item = safeObject(value)
      return {
        id: text(item.id) || `local-item-${index + 1}`,
        description: text(item.description),
        quantity: finiteNumber(item.quantity, 1),
        unit_price: finiteNumber(item.unit_price, 0),
        tax_rate: finiteNumber(item.tax_rate, 0),
      }
    }),
    issueDate: text(payload.issueDate),
    dueDate: text(payload.dueDate),
    currency: text(payload.currency).slice(0, 3),
    taxCountry: text(payload.taxCountry).slice(0, 8),
    taxType: text(payload.taxType).slice(0, 24),
    notes: text(payload.notes).slice(0, 10000),
  }
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

export async function getOfflineDraft<T = Record<string, unknown>>(
  userId: string,
  workspaceId: string,
  kind: OfflineFormDraftKind
) {
  const result = await runRequest<OfflineDraft<T> | undefined>('readonly', (store) =>
    store.get(buildOfflineDraftKey(userId, workspaceId, kind)))
  return result ?? null
}

export async function getOfflineInvoiceDraft(userId: string, workspaceId: string, localId: string) {
  const database = await openDatabase()
  return new Promise<OfflineInvoiceDraft | null>((resolve, reject) => {
    const transaction = database.transaction(INVOICE_DRAFT_STORE, 'readonly')
    const request = transaction.objectStore(INVOICE_DRAFT_STORE).get(buildOfflineInvoiceDraftKey(userId, workspaceId, localId))
    request.onsuccess = () => resolve((request.result as OfflineInvoiceDraft | undefined) ?? null)
    request.onerror = () => reject(new Error('offline_storage_unavailable'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}

export async function saveOfflineInvoiceDraft(
  userId: string,
  workspaceId: string,
  localId: string,
  payload: unknown,
): Promise<OfflineInvoiceDraft> {
  const database = await openDatabase()
  const key = buildOfflineInvoiceDraftKey(userId, workspaceId, localId)
  const sanitizedPayload = sanitizeOfflineInvoiceDraftPayload(payload)
  if (new Blob([JSON.stringify(sanitizedPayload)]).size > MAX_DRAFT_BYTES) {
    database.close()
    throw new Error('offline_draft_too_large')
  }

  return new Promise<OfflineInvoiceDraft>((resolve, reject) => {
    const transaction = database.transaction(INVOICE_DRAFT_STORE, 'readwrite')
    const store = transaction.objectStore(INVOICE_DRAFT_STORE)
    const existingRequest = store.get(key)
    const countRequest = store.index('by_user_workspace').count([userId, workspaceId])
    const now = new Date().toISOString()
    let result: OfflineInvoiceDraft
    let existing: OfflineInvoiceDraft | undefined
    let existingLoaded = false
    let count = 0
    let countLoaded = false
    let limitReached = false
    const writeIfReady = () => {
      if (!existingLoaded || !countLoaded) return
      if (!existing && count >= MAX_LOCAL_INVOICE_DRAFTS_PER_WORKSPACE) {
        limitReached = true
        transaction.abort()
        return
      }
      result = {
        key,
        localId,
        kind: 'invoice',
        userId,
        workspaceId,
        payload: sanitizedPayload,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      store.put(result)
    }
    existingRequest.onsuccess = () => {
      existing = existingRequest.result as OfflineInvoiceDraft | undefined
      existingLoaded = true
      writeIfReady()
    }
    countRequest.onsuccess = () => {
      count = countRequest.result
      countLoaded = true
      writeIfReady()
    }
    existingRequest.onerror = () => reject(new Error('offline_storage_unavailable'))
    countRequest.onerror = () => reject(new Error('offline_storage_unavailable'))
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onabort = () => {
      database.close()
      reject(new Error(limitReached ? 'offline_draft_limit_reached' : 'offline_storage_unavailable'))
    }
    transaction.onerror = () => {
      if (limitReached) return
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}

export async function deleteOfflineInvoiceDraft(userId: string, workspaceId: string, localId: string) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INVOICE_DRAFT_STORE, 'readwrite')
    transaction.objectStore(INVOICE_DRAFT_STORE).delete(buildOfflineInvoiceDraftKey(userId, workspaceId, localId))
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}

export async function listOfflineInvoiceDrafts(userId: string, workspaceId?: string) {
  const database = await openDatabase()
  return new Promise<OfflineInvoiceDraft[]>((resolve, reject) => {
    const transaction = database.transaction(INVOICE_DRAFT_STORE, 'readonly')
    const store = transaction.objectStore(INVOICE_DRAFT_STORE)
    const request = workspaceId
      ? store.index('by_user_workspace').getAll([userId, workspaceId])
      : store.index('by_user').getAll(userId)
    request.onsuccess = () => resolve(request.result as OfflineInvoiceDraft[])
    request.onerror = () => reject(new Error('offline_storage_unavailable'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}

export async function saveOfflineDraft(
  userId: string,
  workspaceId: string,
  kind: OfflineFormDraftKind,
  payload: unknown
) {
  const key = buildOfflineDraftKey(userId, workspaceId, kind)
  const sanitizedPayload = sanitizeOfflineDraftPayload(kind, payload)
  if (new Blob([JSON.stringify(sanitizedPayload)]).size > MAX_DRAFT_BYTES) {
    throw new Error('offline_draft_too_large')
  }

  const existing = await getOfflineDraft(userId, workspaceId, kind)
  const now = new Date().toISOString()
  const draft: OfflineDraft = {
    key,
    kind,
    userId,
    workspaceId,
    payload: sanitizedPayload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await runRequest<IDBValidKey>('readwrite', (store) => store.put(draft))
  return draft
}

export async function deleteOfflineDraft(userId: string, workspaceId: string, kind: OfflineFormDraftKind) {
  await runRequest<undefined>('readwrite', (store) => store.delete(buildOfflineDraftKey(userId, workspaceId, kind)))
}

export async function listOfflineDrafts(userId: string, workspaceId?: string): Promise<Array<OfflineDraft | OfflineInvoiceDraft>> {
  const database = await openDatabase()
  return new Promise<Array<OfflineDraft | OfflineInvoiceDraft>>((resolve, reject) => {
    const transaction = database.transaction([DRAFT_STORE, INVOICE_DRAFT_STORE], 'readonly')
    const ordinaryStore = transaction.objectStore(DRAFT_STORE)
    const invoiceStore = transaction.objectStore(INVOICE_DRAFT_STORE)
    const ordinaryRequest = workspaceId
      ? ordinaryStore.index('by_user_workspace').getAll([userId, workspaceId])
      : ordinaryStore.index('by_user').getAll(userId)
    const invoiceRequest = workspaceId
      ? invoiceStore.index('by_user_workspace').getAll([userId, workspaceId])
      : invoiceStore.index('by_user').getAll(userId)
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
    transaction.oncomplete = () => {
      database.close()
      resolve([
        ...(ordinaryRequest.result as OfflineDraft[]),
        ...(invoiceRequest.result as OfflineInvoiceDraft[]),
      ])
    }
  })
}

export async function clearOfflineDataForUser(userId: string) {
  const drafts = await listOfflineDrafts(userId)
  if (drafts.length === 0) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([DRAFT_STORE, INVOICE_DRAFT_STORE], 'readwrite')
    const store = transaction.objectStore(DRAFT_STORE)
    const invoiceStore = transaction.objectStore(INVOICE_DRAFT_STORE)
    for (const draft of drafts) {
      if (draft.kind === 'invoice') invoiceStore.delete(draft.key)
      else store.delete(draft.key)
    }
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}
