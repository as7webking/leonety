export type ClientStatusFilter = 'all' | 'active' | 'inactive'
export type ClientStatusGroup = Exclude<ClientStatusFilter, 'all'>

export interface ClientPageSegment {
  group: ClientStatusGroup
  from: number
  to: number
}

export function normalizeClientStatusFilter(value: string | null | undefined): ClientStatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all'
}

export function planClientPage({
  filter,
  activeCount,
  inactiveCount,
  page,
  pageSize,
}: {
  filter: ClientStatusFilter
  activeCount: number
  inactiveCount: number
  page: number
  pageSize: number
}): ClientPageSegment[] {
  const safePage = Math.max(0, page)
  const start = safePage * pageSize
  const endExclusive = start + pageSize

  if (filter !== 'all') {
    const count = filter === 'active' ? activeCount : inactiveCount
    if (start >= count) return []
    return [{ group: filter, from: start, to: Math.min(count, endExclusive) - 1 }]
  }

  const segments: ClientPageSegment[] = []
  const activeStart = Math.min(activeCount, start)
  const activeEnd = Math.min(activeCount, endExclusive)
  if (activeStart < activeEnd) {
    segments.push({ group: 'active', from: activeStart, to: activeEnd - 1 })
  }

  const inactiveStart = Math.max(0, start - activeCount)
  const inactiveEnd = Math.min(inactiveCount, endExclusive - activeCount)
  if (inactiveStart < inactiveEnd) {
    segments.push({ group: 'inactive', from: inactiveStart, to: inactiveEnd - 1 })
  }
  return segments
}

export function getFilteredClientTotal(filter: ClientStatusFilter, activeCount: number, inactiveCount: number) {
  if (filter === 'active') return activeCount
  if (filter === 'inactive') return inactiveCount
  return activeCount + inactiveCount
}
