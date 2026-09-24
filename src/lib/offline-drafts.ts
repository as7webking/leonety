'use client'

export type OfflineDraftKind = 'income' | 'expense' | 'contract'

export interface OfflineDraft<T = Record<string, unknown>> {
  key: string
  kind: OfflineDraftKind
  userId: string
  workspaceId: string
  payload: T
  createdAt: string
  updatedAt: string
}

const DATABASE_NAME = 'leonety-offline-v1'
const DATABASE_VERSION = 1
const DRAFT_STORE = 'drafts'
const MAX_DRAFT_BYTES = 512 * 1024

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
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  }))
}

export function buildOfflineDraftKey(userId: string, workspaceId: string, kind: OfflineDraftKind) {
  return `${userId}:${workspaceId}:${kind}:new`
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

export function sanitizeOfflineDraftPayload(kind: OfflineDraftKind, value: unknown): Record<string, unknown> {
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

export async function getOfflineDraft<T = Record<string, unknown>>(
  userId: string,
  workspaceId: string,
  kind: OfflineDraftKind
) {
  const result = await runRequest<OfflineDraft<T> | undefined>('readonly', (store) =>
    store.get(buildOfflineDraftKey(userId, workspaceId, kind)))
  return result ?? null
}

export async function saveOfflineDraft(
  userId: string,
  workspaceId: string,
  kind: OfflineDraftKind,
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

export async function deleteOfflineDraft(userId: string, workspaceId: string, kind: OfflineDraftKind) {
  await runRequest<undefined>('readwrite', (store) => store.delete(buildOfflineDraftKey(userId, workspaceId, kind)))
}

export async function listOfflineDrafts(userId: string, workspaceId?: string) {
  const database = await openDatabase()
  return new Promise<OfflineDraft[]>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, 'readonly')
    const store = transaction.objectStore(DRAFT_STORE)
    const request = workspaceId
      ? store.index('by_user_workspace').getAll([userId, workspaceId])
      : store.index('by_user').getAll(userId)
    request.onsuccess = () => resolve(request.result as OfflineDraft[])
    request.onerror = () => reject(new Error('offline_storage_unavailable'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(new Error('offline_storage_unavailable'))
    }
  })
}

export async function clearOfflineDataForUser(userId: string) {
  const drafts = await listOfflineDrafts(userId)
  if (drafts.length === 0) return
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, 'readwrite')
    const store = transaction.objectStore(DRAFT_STORE)
    for (const draft of drafts) store.delete(draft.key)
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
