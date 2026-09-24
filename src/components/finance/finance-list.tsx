import type { ReactNode } from 'react'
import { Search, SlidersHorizontal, Wrench } from 'lucide-react'
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
  utilitiesLabel: string
  filters?: ReactNode
  utilities?: ReactNode
}

export function FinanceToolbar({ filtersLabel, utilitiesLabel, filters, utilities }: FinanceToolbarProps) {
  return (
    <section className="mb-5 space-y-3" aria-label={filtersLabel}>
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        {filters && (
          <details className="group rounded-md border border-slate-200 bg-white open:col-span-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700">
              <SlidersHorizontal className="h-4 w-4" />
              {filtersLabel}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 [&>*]:max-w-full">{filters}</div>
          </details>
        )}
        {utilities && (
          <details className="group rounded-md border border-slate-200 bg-white open:col-span-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700">
              <Wrench className="h-4 w-4" />
              {utilitiesLabel}
            </summary>
            <div className="grid min-w-0 gap-2 border-t border-slate-200 p-3 [&>*]:max-w-full">{utilities}</div>
          </details>
        )}
      </div>
      {utilities && (
        <div className="hidden min-w-0 items-center gap-5 border-y border-slate-200 bg-slate-50/70 px-3 py-3 lg:flex">
          <h2 className="shrink-0 text-xs font-semibold uppercase text-slate-500">{utilitiesLabel}</h2>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{utilities}</div>
        </div>
      )}
      {filters && (
        <div className="hidden min-w-0 flex-wrap items-center gap-2 lg:flex">
          <span className="mr-1 text-xs font-semibold uppercase text-slate-500">{filtersLabel}</span>
          {filters}
        </div>
      )}
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
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="finance-list-grid hidden border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500 lg:grid">
        <span>{titleLabel}</span><span>{categoryLabel}</span><span>{dateLabel}</span>
        <span className="text-right">{amountLabel}</span><span className="text-center">{selectionLabel}</span>
        <span className="text-right">{actionsLabel}</span>
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
    <article className={cn('finance-list-grid min-w-0 gap-y-3 px-4 py-4', className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{badge}<p className="min-w-0 break-words font-medium text-slate-950">{title}</p></div>
        {description && <p className="mt-1 break-words text-sm text-slate-500">{description}</p>}
      </div>
      <div className="min-w-0 text-sm text-slate-600">{category}</div>
      <div className="text-sm text-slate-500">{date}</div>
      <div className="text-right"><div className="whitespace-nowrap font-semibold tabular-nums text-slate-950">{amount}</div>{amountDetail && <div className="mt-1 whitespace-nowrap text-xs tabular-nums text-slate-500">{amountDetail}</div>}</div>
      <div className="flex min-h-10 items-center justify-end lg:justify-center">{selection}</div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{actions}</div>
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
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-end gap-3 rounded-md border border-slate-200 bg-white p-3">
      <label className="flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} className="h-4 w-4" />
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
