import type { Locale } from '@/lib/i18n'

const categoryKeys: Record<string, string> = {
  salary: 'category.salary',
  freelance: 'category.freelance',
  investment: 'category.investment',
  sales: 'category.sales',
  service: 'category.service',
  'invoice payment': 'category.invoicePayment',
  food: 'category.food',
  utilities: 'category.utilities',
  rent: 'category.rent',
  other: 'category.other',
}

export function getCategoryTranslationKey(category: string | null | undefined) {
  const normalized = String(category ?? '').trim().toLowerCase()
  return categoryKeys[normalized] ?? null
}

export function formatCategoryLabel(
  category: string | null | undefined,
  t: (key: string) => string,
) {
  const fallback = String(category ?? '').trim()
  const key = getCategoryTranslationKey(fallback)

  return key ? t(key) : fallback || t('category.uncategorized')
}

export function formatMonthLabel(monthKey: string, locale: Locale) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}
