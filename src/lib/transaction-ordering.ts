export type TransactionOrder = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'title-asc' | 'title-desc'
export type TransactionGroupOrder = 'chronological' | 'income-first' | 'expenses-first'
export type TransactionDayOrder = 'chronological' | 'income-first' | 'expenses-first'

export interface OrderableTransaction {
  id: string
  type: 'income' | 'expense'
  date: string
  title: string | null
  description: string | null
  amount: number
  created_at?: string | null
}

function typeRank(type: OrderableTransaction['type'], order: TransactionGroupOrder | TransactionDayOrder) {
  if (order === 'income-first') return type === 'income' ? 0 : 1
  if (order === 'expenses-first') return type === 'expense' ? 0 : 1
  return 0
}

function compareStable(left: OrderableTransaction, right: OrderableTransaction) {
  return (left.created_at ?? '').localeCompare(right.created_at ?? '')
    || left.id.localeCompare(right.id)
    || left.type.localeCompare(right.type)
}

export function orderTransactions<T extends OrderableTransaction>(
  transactions: readonly T[],
  order: TransactionOrder,
  groupOrder: TransactionGroupOrder,
  dayOrder: TransactionDayOrder,
  locale?: string,
): T[] {
  const [key, direction] = order.split('-') as ['date' | 'amount' | 'title', 'asc' | 'desc']
  const directionFactor = direction === 'asc' ? 1 : -1

  return transactions.map((transaction, index) => ({ transaction, index })).sort((leftEntry, rightEntry) => {
    const left = leftEntry.transaction
    const right = rightEntry.transaction

    const groupRank = typeRank(left.type, groupOrder) - typeRank(right.type, groupOrder)
    if (groupRank !== 0) return groupRank

    if (key === 'date') {
      const dateOrder = left.date.localeCompare(right.date) * directionFactor
      if (dateOrder !== 0) return dateOrder

      const dayRank = typeRank(left.type, dayOrder) - typeRank(right.type, dayOrder)
      if (dayRank !== 0) return dayRank
      return compareStable(left, right) || leftEntry.index - rightEntry.index
    }

    const primary = key === 'amount'
      ? (left.amount - right.amount) * directionFactor
      : (left.title || left.description || '').localeCompare(right.title || right.description || '', locale, { sensitivity: 'base' }) * directionFactor

    return primary || compareStable(left, right) || leftEntry.index - rightEntry.index
  }).map(({ transaction }) => transaction)
}
