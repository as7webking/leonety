import type { ReactNode } from 'react'
import { Info, Search, SlidersHorizontal, Wrench } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
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
  filters?: ReactNode
  sorting?: ReactNode
  utilities?: ReactNode
}

export function FinanceToolbar({ filtersLabel, sortingLabel, utilitiesLabel, filters, sorting, utilities }: FinanceToolbarProps) {
  return (
    <section className="mb-5 space-y-3" aria-label={filtersLabel}>
      <div className="grid grid-cols-2 gap-2 lg:block lg:space-y-3">
        {filters && (
          <details className="group rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
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
          <details className="group rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
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
          <details className="group col-span-2 rounded-md border border-slate-200 bg-white open:col-span-2 lg:border-0 lg:bg-transparent">
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
  badge?: ReactNode
  selection?: ReactNode
  actions?: ReactNode
  className?: string
}

export function FinanceListRow({ title, description, category, date, amount, amountDetail, badge, selection, actions, className }: FinanceListRowProps) {
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
      <div className="grid min-w-0 max-w-full gap-1 text-left lg:text-right"><div className="min-w-0 max-w-full whitespace-normal break-words font-semibold leading-5 tabular-nums text-slate-950 [overflow-wrap:anywhere]">{amount}</div>{amountDetail && <div className="min-w-0 max-w-full whitespace-normal break-words text-xs leading-4 tabular-nums text-slate-500 [overflow-wrap:anywhere]">{amountDetail}</div>}</div>
      <div className={cn('flex min-w-0 flex-wrap items-center justify-start gap-2 lg:flex-nowrap lg:justify-end', !selection && 'finance-list-actions-without-selection')}>{actions}</div>
      {selection && <div className="flex min-h-10 items-center justify-start lg:justify-center">{selection}</div>}
    </article>
  )
}

export function CurrencyConversionDisclosure({ label, detail }: { label: string; detail: string }) {
  return (
    <details className="max-w-full text-left">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 break-words rounded-sm text-xs text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </summary>
      <p className="max-w-full whitespace-normal break-words pb-1 text-xs leading-4 text-amber-800">{detail}</p>
    </details>
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
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white">
          <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} className="h-5 w-5 accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" />
        </span>
        {selectVisibleLabel}
      </label>
      <span className="text-sm text-slate-500">{selectedLabel}</span>
      {children}
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
}

export function FinancePagination({ page, totalPages, totalItems, label, previousLabel, nextLabel, onPageChange }: FinancePaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={label}>
      <p className="text-sm text-slate-500">{label.replace('{page}', String(page)).replace('{pages}', String(totalPages)).replace('{total}', String(totalItems))}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{previousLabel}</Button>
        <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{nextLabel}</Button>
      </div>
    </nav>
  )
}
