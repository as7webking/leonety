import { z } from 'zod'

// Shared field validations
const positiveAmount = z.number().positive('Amount must be greater than 0')
const nonEmptyString = z.string().min(1, 'This field is required').max(255, 'Text is too long').trim()
const dateString = z.string().date('Invalid date')
const currencyCode = z.string().length(3, 'Invalid currency code').toUpperCase()

export const incomeSchema = z.object({
  amount: positiveAmount,
  description: nonEmptyString,
  category: nonEmptyString,
  date: dateString,
  currency: currencyCode,
})

export const expenseSchema = z.object({
  amount: positiveAmount,
  description: nonEmptyString,
  category: nonEmptyString,
  date: dateString,
  currency: currencyCode,
})

export const timeEntrySchema = z.object({
  description: nonEmptyString,
  hours: z.number().int().min(0).max(24),
  minutes: z.number().int().min(0).max(59),
  date: dateString,
})

export const profileUpdateSchema = z.object({
  full_name: nonEmptyString.max(100),
  currency: currencyCode,
})

export type IncomeForm = z.infer<typeof incomeSchema>
export type ExpenseForm = z.infer<typeof expenseSchema>
export type TimeEntryForm = z.infer<typeof timeEntrySchema>
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

/**
 * Safe error formatter: Returns user-friendly message without exposing internals.
 * Never log or expose the original error to users.
 */
export function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0]
    return firstIssue?.message || 'Invalid input'
  }
  if (error instanceof Error && error.message.includes('Unique constraint')) {
    return 'This entry already exists'
  }
  return 'An error occurred. Please try again.'
}