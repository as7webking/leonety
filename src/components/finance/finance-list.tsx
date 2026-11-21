import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Info, Search, SlidersHorizontal, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { FINANCE_PAGE_SIZES, formatHistoricalRateDetail, getFinanceDatePreset, getFinanceDatePresetRange, isValidOptionalDateRange, type FinanceDatePreset } from '@/lib/finance-ui'
import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export const FINANCE_PAGE_SIZE = 25

interface FinanceSearchInputProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
}

export function FinanceSearchInput({ value, onChange, label, placeholder }: FinanceSearchInputProps) {
  return (
    <label className="relative block w-full lg:w-64">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </label>
  )
}

interface FinanceToolbarProps {
  filtersLabel: string
  sortingLabel?: string
  utilitiesLabel: string
  primaryAction?: ReactNode
  filters?: ReactNode
  sorting?: ReactNode
  utilities?: ReactNode
  alwaysVisibleFilters?: ReactNode
}

export function FinanceToolbar({ filtersLabel, sortingLabel, utilitiesLabel, primaryAction, filters, sorting, utilities, alwaysVisibleFilters }: FinanceToolbarProps) {
  const disclosureRefs = useRef<Array<HTMLDetailsElement | null>>([])

  useLayoutEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const syncDisclosureState = () => {
      for (const disclosure of disclosureRefs.current) {
        if (disclosure) disclosure.open = media.matches
      }
    }
    syncDisclosureState()
    media.addEventListener('change', syncDisclosureState)
    return () => media.removeEventListener('change', syncDisclosureState)
  }, [])

  return (
    <section className="mb-5 space-y-3" aria-label={filtersLabel}>
      {primaryAction && <div className="flex justify-end">{primaryAction}</div>}
      {alwaysVisibleFilters && <div className="rounded-md border border-slate-200 bg-white p-3" aria-label={filtersLabel}>{alwaysVisibleFilters}</div>}
      <div className="grid grid-cols-2 gap-2 lg:block lg:space-y-3">
        {filters && (
          <details ref={(element) => { disclosureRefs.current[0] = element }} className="group rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              {filtersLabel}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 [&>*]:max-w-full lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:border-0 lg:p-0">
              <span className="hidden text-xs font-semibold uppercase text-slate-500 lg:inline">{filtersLabel}</span>
              {filters}
            </div>
          </details>
        )}
        {sorting && (
          <details ref={(element) => { disclosureRefs.current[1] = element }} className="group rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" />
              {sortingLabel}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 [&>*]:max-w-full lg:flex lg:flex-wrap lg:items-center lg:gap-2 lg:border-0 lg:p-0">
              <span className="hidden text-xs font-semibold uppercase text-slate-500 lg:inline">{sortingLabel}</span>
              {sorting}
            </div>
          </details>
        )}
        {utilities && (
          <details ref={(element) => { disclosureRefs.current[2] = element }} className="group col-span-2 rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700 lg:hidden">
              <Wrench className="h-4 w-4" />
              {utilitiesLabel}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 [&>*]:max-w-full lg:flex lg:min-w-0 lg:flex-wrap lg:items-center lg:gap-2 lg:border-y lg:bg-slate-50/70 lg:px-3 lg:py-3">
              <h2 className="hidden shrink-0 text-xs font-semibold uppercase text-slate-500 lg:block">{utilitiesLabel}</h2>
              {utilities}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}

interface FinanceDateFiltersProps {
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  locale: Locale
  fromLabel: string
  toLabel: string
  presetLabel: string
  presetLabels: Record<Exclude<FinanceDatePreset, 'custom'> | 'custom', string>
  invalidRangeLabel: string
}

export function FinanceDateFilters({ fromDate, toDate, onFromDateChange, onToDateChange, locale, fromLabel, toLabel, presetLabel, presetLabels, invalidRangeLabel }: FinanceDateFiltersProps) {
  const validRange = isValidOptionalDateRange(fromDate, toDate)
  const preset = getFinanceDatePreset(fromDate, toDate)
  const dateInputClass = 'h-10 min-w-0 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  const updatePreset = (value: string) => {
    if (value === 'custom') return
    const range = getFinanceDatePresetRange(value as Exclude<FinanceDatePreset, 'custom'>)
    onFromDateChange(range.fromDate)
    onToDateChange(range.toDate)
  }

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]">
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
        <span>{presetLabel}</span>
        <select value={preset} onChange={(event) => updatePreset(event.target.value)} className={dateInputClass}>
          {(['thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'] as const).map((value) => <option key={value} value={value}>{presetLabels[value]}</option>)}
        </select>
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
        <span>{fromLabel}</span>
        <input type="date" lang={locale} value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} className={dateInputClass} aria-invalid={!validRange} />
      </label>
      <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
        <span>{toLabel}</span>
        <input type="date" lang={locale} value={toDate} onChange={(event) => onToDateChange(event.target.value)} className={dateInputClass} aria-invalid={!validRange} />
      </label>
      {!validRange && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-3">{invalidRangeLabel}</p>}
    </div>
  )
}

interface FinanceListShellProps {
  titleLabel: string
  categoryLabel: string
  dateLabel: string
  amountLabel: string
  selectionLabel?: string
  actionsLabel: string
  children: ReactNode
}

export function FinanceListShell({ titleLabel, categoryLabel, dateLabel, amountLabel, selectionLabel, actionsLabel, children }: FinanceListShellProps) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-slate-200 bg-white', selectionLabel ? 'finance-list-grid-with-selection' : 'finance-list-grid-no-selection')}>
      <div className={cn('finance-list-grid hidden border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid', selectionLabel ? 'finance-list-grid-with-selection' : 'finance-list-grid-no-selection')}>
        <span>{titleLabel}</span><span>{categoryLabel}</span><span>{dateLabel}</span>
        <span className="text-right">{amountLabel}</span>
        <span className="text-right">{actionsLabel}</span>{selectionLabel && <span className="text-center">{selectionLabel}</span>}
      </div>
      <div className="divide-y divide-slate-200">{children}</div>
    </div>
  )
}

interface FinanceListRowProps {
  title: string
  description?: string | null
  category?: ReactNode
  date: ReactNode
  amount: ReactNode
  amountDetail?: ReactNode
  conversionRate?: {
    rate: number | string | null | undefined
    source: string | null | undefined
    rateDate: string | null | undefined
    fromCurrency: string
    toCurrency: string
    locale: string
    label: string
  }
  conversionStatus?: { label: string; detail: string }
  badge?: ReactNode
  selection?: ReactNode
  actions?: ReactNode
  className?: string
}

export function FinanceListRow({ title, description, category, date, amount, amountDetail, conversionRate, conversionStatus, badge, selection, actions, className }: FinanceListRowProps) {
  const [conversionDetailsOpen, setConversionDetailsOpen] = useState(false)
  const conversionDetailsId = useId()
  const conversionRateText = conversionRate ? formatHistoricalRateDetail(conversionRate) : null

  return (
    <article className={cn('finance-list-grid min-w-0 gap-y-2 px-4 py-3', selection ? 'finance-list-grid-with-selection' : 'finance-list-grid-no-selection', className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{badge}<p className="min-w-0 break-words font-medium text-slate-950">{title}</p></div>
        {description && <p className="mt-1 hidden break-words text-sm text-slate-500 lg:block">{description}</p>}
      </div>
      <div className="min-w-0 text-sm text-slate-600">
        {category}
        {description && <p className="mt-1 break-words text-slate-500 lg:hidden">{description}</p>}
      </div>
      <div className="border-t border-slate-100 pt-2 text-sm text-slate-500 lg:border-0 lg:pt-0">{date}</div>
      <div className="grid min-w-0 max-w-full grid-cols-1 gap-y-1 text-left lg:text-right">
        <div className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap font-semibold leading-5 tabular-nums text-slate-950">
          {amount}
        </div>
        {conversionStatus && <button
          type="button"
          aria-label={conversionStatus.label}
          aria-expanded={conversionDetailsOpen}
          aria-controls={conversionDetailsId}
          onClick={() => setConversionDetailsOpen((open) => !open)}
          className="flex min-h-11 min-w-11 max-w-full shrink-0 items-center justify-start gap-1 rounded-md px-1 text-xs leading-4 text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 lg:justify-end"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
          <span>{conversionStatus.label}</span>
        </button>}
        {conversionStatus && <p id={conversionDetailsId} role="note" hidden={!conversionDetailsOpen} className="min-w-0 whitespace-normal break-words text-left text-xs leading-4 text-amber-800 lg:text-right">{conversionStatus.detail}</p>}
        {amountDetail && <div className="min-w-0 max-w-full whitespace-normal break-words text-xs leading-4 tabular-nums text-slate-500 [overflow-wrap:anywhere]">{amountDetail}</div>}
        {conversionRateText && <div className="min-w-0 max-w-full whitespace-normal break-words text-xs leading-4 text-slate-500 [overflow-wrap:anywhere]">{conversionRateText}</div>}
      </div>
      <div className={cn('flex min-w-0 flex-wrap items-center justify-start gap-2 lg:flex-nowrap lg:justify-end', !selection && 'finance-list-actions-without-selection')}>{actions}</div>
      {selection && <div className="flex min-h-10 items-center justify-start lg:justify-center">{selection}</div>}
    </article>
  )
}

interface FinanceSelectionBarProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  selectVisibleLabel: string
  selectedLabel: string
  children?: ReactNode
}

export function FinanceSelectionBar({ checked, onCheckedChange, selectVisibleLabel, selectedLabel, children }: FinanceSelectionBarProps) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
      {children}
      <span className="text-sm text-slate-500">{selectedLabel}</span>
      <label className="ml-auto flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-700">
        <span>{selectVisibleLabel}</span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white">
          <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} className="h-5 w-5 accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" />
        </span>
      </label>
    </div>
  )
}

interface FinanceEmptyStateProps {
  filtered: boolean
  emptyTitle: string
  emptyDescription: string
  filteredTitle: string
  filteredDescription: string
  action?: { label: string; onClick: () => void }
}

export function FinanceEmptyState({ filtered, emptyTitle, emptyDescription, filteredTitle, filteredDescription, action }: FinanceEmptyStateProps) {
  return <EmptyState title={filtered ? filteredTitle : emptyTitle} description={filtered ? filteredDescription : emptyDescription} action={action} className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 px-4" />
}

interface FinancePaginationProps {
  page: number
  totalPages: number
  totalItems: number
  label: string
  previousLabel: string
  nextLabel: string
  onPageChange: (page: number) => void
  pageSize?: number
  pageSizeLabel?: string
  onPageSizeChange?: (pageSize: number) => void
}

export function FinancePagination({ page, totalPages, totalItems, label, previousLabel, nextLabel, onPageChange, pageSize, pageSizeLabel, onPageSizeChange }: FinancePaginationProps) {
  if (totalItems === 0 || (totalPages <= 1 && pageSize === undefined)) return null

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={label}>
      <p className="text-sm text-slate-500">{label.replace('{page}', String(page)).replace('{pages}', String(totalPages)).replace('{total}', String(totalItems))}</p>
      <div className="flex flex-wrap items-center gap-2">
        {pageSize !== undefined && onPageSizeChange && <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>{pageSizeLabel}</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {FINANCE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>}
        {totalPages > 1 && <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{previousLabel}</Button>
          <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{nextLabel}</Button>
        </div>}
      </div>
    </nav>
  )
}
