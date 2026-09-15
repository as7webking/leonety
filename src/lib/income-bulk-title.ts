import { z } from 'zod'

export const MAX_BULK_INCOME_TITLE_COUNT = 100

export const bulkIncomeTitleRequestSchema = z.object({
  companyId: z.string().uuid(),
  incomeIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_INCOME_TITLE_COUNT),
  title: z.string().trim().min(1).max(160),
}).superRefine(({ incomeIds }, context) => {
  if (new Set(incomeIds).size !== incomeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['incomeIds'],
      message: 'Income IDs must be unique.',
    })
  }
})

export function applyIncomeTitleToSelection<T extends { id: string; title?: string | null }>(
  incomes: T[],
  selectedIds: readonly string[],
  title: string,
) {
  const selected = new Set(selectedIds)
  return incomes.map((income) => selected.has(income.id) ? { ...income, title } : income)
}
