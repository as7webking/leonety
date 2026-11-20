export type CashBookEntryKind = 'opening' | 'income' | 'expense' | 'reversal'

export interface CashBookRegister {
  id: string
  workspaceId: string
  currency: string
  active: boolean
}

export interface CashBookEntry {
  id: string
  registerId: string
  workspaceId: string
  kind: CashBookEntryKind
  date: string
  createdAt: string
  createdBy: string
  currency: string
  amountMinor: number
  description: string
  idempotencyKey: string
  sourceKey?: string | null
  receiptReference?: string | null
  paymentMethod?: string | null
  openingConfirmed?: boolean
  reversesEntryId?: string | null
  correctionReason?: string | null
}

export interface CashBookRow {
  entry: CashBookEntry
  signedAmountMinor: number
  balanceMinor: number
}

export interface CashBookBalance {
  rows: CashBookRow[]
  closingBalanceMinor: number
  negativeBalanceEntryIds: string[]
}

export class CashBookDomainError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CashBookDomainError'
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new CashBookDomainError(code, message)
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function compareEntries(left: CashBookEntry, right: CashBookEntry) {
  return left.date.localeCompare(right.date)
    || Number(right.kind === 'opening') - Number(left.kind === 'opening')
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}

function sameIdempotentRequest(left: CashBookEntry, right: CashBookEntry) {
  return left.registerId === right.registerId
    && left.workspaceId === right.workspaceId
    && left.kind === right.kind
    && left.date === right.date
    && left.createdBy === right.createdBy
    && left.currency.toUpperCase() === right.currency.toUpperCase()
    && left.amountMinor === right.amountMinor
    && left.description === right.description
    && (left.sourceKey ?? null) === (right.sourceKey ?? null)
    && (left.receiptReference ?? null) === (right.receiptReference ?? null)
    && (left.paymentMethod ?? null) === (right.paymentMethod ?? null)
    && (left.openingConfirmed ?? false) === (right.openingConfirmed ?? false)
    && (left.reversesEntryId ?? null) === (right.reversesEntryId ?? null)
    && (left.correctionReason ?? null) === (right.correctionReason ?? null)
}

function assertEntryBasics(register: CashBookRegister, entry: CashBookEntry) {
  if (entry.registerId !== register.id || entry.workspaceId !== register.workspaceId) {
    fail('workspace_mismatch', 'Entry does not belong to this register and workspace.')
  }
  if (entry.currency.toUpperCase() !== register.currency.toUpperCase()) {
    fail('currency_mismatch', 'Cash-book entries must use the register currency; conversion is not performed.')
  }
  if (!validDate(entry.date)) fail('invalid_date', 'Entry date must be a valid ISO calendar date.')
  if (!Number.isFinite(Date.parse(entry.createdAt)) || !entry.createdBy.trim()) {
    fail('missing_audit_metadata', 'Entry creation time and actor are required.')
  }
  if (!entry.id.trim() || !entry.idempotencyKey.trim()) {
    fail('missing_identity', 'Entry ID and idempotency key are required.')
  }
  if (!Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0) {
    fail('invalid_amount', 'Amount must be a non-negative integer in minor currency units.')
  }

  if (entry.kind === 'opening') {
    if (entry.openingConfirmed !== true) {
      fail('opening_not_confirmed', 'Opening balance requires explicit confirmation.')
    }
  } else if (entry.kind === 'income' || entry.kind === 'expense') {
    if (entry.amountMinor === 0) fail('invalid_amount', 'Cash movement amount must be greater than zero.')
    if (entry.paymentMethod !== 'cash') {
      fail('cash_not_confirmed', 'Only an explicitly cash-classified movement can enter the cash book.')
    }
  } else {
    if (entry.amountMinor === 0 || !entry.reversesEntryId || !entry.correctionReason?.trim()) {
      fail('invalid_reversal', 'A reversal requires a positive amount, target entry and correction reason.')
    }
  }
}

function signedAmount(entry: CashBookEntry, original?: CashBookEntry) {
  if (entry.kind === 'expense') return -entry.amountMinor
  if (entry.kind === 'reversal') {
    if (!original) fail('reversal_target_missing', 'The entry being reversed does not exist in this register.')
    return original.kind === 'expense' ? entry.amountMinor : -entry.amountMinor
  }
  return entry.amountMinor
}

function validateAppend(
  register: CashBookRegister,
  currentEntries: readonly CashBookEntry[],
  candidate: CashBookEntry,
  requireActive: boolean,
): CashBookEntry[] {
  assertEntryBasics(register, candidate)
  for (const current of currentEntries) assertEntryBasics(register, current)

  const sameRequest = currentEntries.find((entry) => entry.idempotencyKey === candidate.idempotencyKey)
  if (sameRequest) {
    if (sameIdempotentRequest(sameRequest, candidate)) return [...currentEntries]
    fail('idempotency_conflict', 'Idempotency key was already used for a different posting.')
  }
  if (requireActive && !register.active) fail('register_inactive', 'Cannot post to an inactive register.')
  if (currentEntries.some((entry) => entry.id === candidate.id)) {
    fail('duplicate_entry', 'Entry ID already exists in this register.')
  }
  if (candidate.sourceKey && currentEntries.some((entry) => entry.sourceKey === candidate.sourceKey)) {
    fail('duplicate_source', 'This source has already been posted to the cash book.')
  }

  let reversalTarget: CashBookEntry | undefined
  if (candidate.kind === 'reversal') {
    reversalTarget = currentEntries.find((entry) => entry.id === candidate.reversesEntryId)
    if (!reversalTarget) fail('reversal_target_missing', 'The entry being reversed does not exist in this register.')
    if (reversalTarget.kind === 'reversal') fail('invalid_reversal_target', 'A reversal cannot itself be reversed.')
    if (reversalTarget.registerId !== candidate.registerId
      || reversalTarget.workspaceId !== candidate.workspaceId
      || reversalTarget.currency.toUpperCase() !== candidate.currency.toUpperCase()) {
      fail('reversal_scope_mismatch', 'Reversal target must belong to the same register, workspace and currency.')
    }
    if (candidate.date < reversalTarget.date) fail('reversal_date_order', 'A reversal cannot predate its original entry.')
    if (candidate.amountMinor !== reversalTarget.amountMinor) {
      fail('partial_reversal', 'Corrections require a full reversal followed by a replacement entry.')
    }
    if (currentEntries.some((entry) => entry.reversesEntryId === reversalTarget?.id)) {
      fail('already_reversed', 'This entry already has a reversal.')
    }
  }

  if (candidate.kind === 'opening' && currentEntries.length > 0) {
    fail('opening_not_first', 'The opening balance must be the first posting in a register.')
  }

  // Evaluate the signed value here as a final check for reversal direction and target.
  signedAmount(candidate, reversalTarget)
  const nextEntries = [...currentEntries, candidate]
  const balance = buildCashBookBalance(register, nextEntries)
  if (balance.negativeBalanceEntryIds.length > 0) {
    fail('negative_balance', 'A cash-book posting cannot create a negative chronological cash balance.')
  }
  return nextEntries
}

export function appendCashBookEntry(
  register: CashBookRegister,
  currentEntries: readonly CashBookEntry[],
  candidate: CashBookEntry,
): CashBookEntry[] {
  return validateAppend(register, currentEntries, candidate, true)
}

export function buildCashBookBalance(
  register: CashBookRegister,
  entries: readonly CashBookEntry[],
): CashBookBalance {
  if (!register.currency.trim()) fail('invalid_register_currency', 'Register currency is required.')

  const ordered = [...entries].sort(compareEntries)
  const rows: CashBookRow[] = []
  const byId = new Map<string, CashBookEntry>()
  const idempotencyKeys = new Set<string>()
  const sourceKeys = new Set<string>()
  const reversedIds = new Set<string>()
  const negativeBalanceEntryIds: string[] = []
  let balanceMinor = 0

  for (const [index, entry] of ordered.entries()) {
    assertEntryBasics(register, entry)
    if (byId.has(entry.id)) fail('duplicate_entry', 'Entry ID is duplicated in this register.')
    if (idempotencyKeys.has(entry.idempotencyKey)) fail('duplicate_idempotency_key', 'Idempotency key is duplicated in this register.')
    if (entry.sourceKey && sourceKeys.has(entry.sourceKey)) fail('duplicate_source', 'Source is posted more than once in this register.')

    if (entry.kind === 'opening' && index !== 0) {
      fail('opening_not_first', 'The opening balance must be the first posting in a register.')
    }

    const original = entry.kind === 'reversal'
      ? byId.get(entry.reversesEntryId ?? '')
      : undefined
    if (entry.kind === 'reversal') {
      if (!original) fail('reversal_target_missing', 'The entry being reversed must precede it in this register.')
      if (original.kind === 'reversal') fail('invalid_reversal_target', 'A reversal cannot itself be reversed.')
      if (original.currency.toUpperCase() !== entry.currency.toUpperCase()) {
        fail('reversal_scope_mismatch', 'Reversal target must use the same currency.')
      }
      if (entry.date < original.date) fail('reversal_date_order', 'A reversal cannot predate its original entry.')
      if (entry.amountMinor !== original.amountMinor) {
        fail('partial_reversal', 'Corrections require a full reversal followed by a replacement entry.')
      }
      if (reversedIds.has(original.id)) fail('already_reversed', 'This entry has more than one reversal.')
      reversedIds.add(original.id)
    }

    const signedAmountMinor = signedAmount(entry, original)
    balanceMinor += signedAmountMinor
    if (balanceMinor < 0) negativeBalanceEntryIds.push(entry.id)
    rows.push({ entry, signedAmountMinor, balanceMinor })
    byId.set(entry.id, entry)
    idempotencyKeys.add(entry.idempotencyKey)
    if (entry.sourceKey) sourceKeys.add(entry.sourceKey)
  }

  return { rows, closingBalanceMinor: balanceMinor, negativeBalanceEntryIds }
}
