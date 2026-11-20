'use client'

import { Printer } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import type { CashBookPrintModel } from '@/lib/cash-book-print'
import styles from './cash-book-print-document.module.css'

function formatMinorCurrency(amountMinor: number, currency: string, locale: string) {
  const digits = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const scale = 10 ** digits
  const integer = Math.floor(amountMinor / scale)
  const fraction = String(amountMinor % scale).padStart(digits, '0')
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const formattedInteger = numberFormat.format(BigInt(integer))
  const formattedFraction = digits
    ? new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: digits, maximumFractionDigits: 0 }).format(BigInt(fraction))
    : ''
  const decimal = digits ? new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.' : ''
  const number = `${formattedInteger}${digits ? `${decimal}${formattedFraction}` : ''}`
  const currencyParts = new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).formatToParts(0)
  const numericTypes = new Set(['integer', 'group', 'decimal', 'fraction'])
  const firstNumeric = currencyParts.findIndex((part) => numericTypes.has(part.type))
  const lastNumeric = currencyParts.findLastIndex((part) => numericTypes.has(part.type))
  return `${currencyParts.slice(0, firstNumeric).map((part) => part.value).join('')}${number}${currencyParts.slice(lastNumeric + 1).map((part) => part.value).join('')}`
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`))
}

export function CashBookPrintDocument({ model }: { model: CashBookPrintModel }) {
  const { locale, t } = useI18n()
  const money = (minor: number) => formatMinorCurrency(minor, model.currency, locale)

  return (
    <section className={styles.document} aria-label={t('cashBook.moduleTitle')}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2">
          <Printer className="h-4 w-4" aria-hidden="true" />{t('cashBook.print')}
        </button>
      </div>

      <header className={styles.header}>
        <div>
          <h1>{t('cashBook.moduleTitle')}</h1>
          <p className={styles.workspace}>{model.workspaceName}</p>
          <p>{t('cashBook.register')}: {model.registerName}</p>
        </div>
        <dl className={styles.meta}>
          <div><dt>{t('kassenbuch.period')}</dt><dd>{formatDate(model.periodStart, locale)} – {formatDate(model.periodEnd, locale)}</dd></div>
          <div><dt>{t('kassenbuch.currency')}</dt><dd>{model.currency}</dd></div>
        </dl>
      </header>

      <dl className={styles.balances}>
        <div><dt>{t('cashBook.opening')}</dt><dd>{money(model.openingBalanceMinor)}</dd></div>
        <div><dt>{t('cashBook.closing')}</dt><dd>{money(model.closingBalanceMinor)}</dd></div>
      </dl>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('kassenbuch.income')}</th>
            <th>{t('kassenbuch.expenses')}</th>
            <th>{t('kassenbuch.date')}</th>
            <th>{t('kassenbuch.balance')}</th>
            <th>{t('kassenbuch.text')}</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.length ? model.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.incomeMinor === null ? '' : money(row.incomeMinor)}</td>
              <td>{row.expenseMinor === null ? '' : money(row.expenseMinor)}</td>
              <td>{formatDate(row.date, locale)}</td>
              <td>{money(row.balanceMinor)}</td>
              <td>
                {row.text}
                {row.receiptReference && <span className={styles.receipt}>{t('cashBook.receipt')}: {row.receiptReference}</span>}
              </td>
            </tr>
          )) : <tr><td colSpan={5}>{t('cashBook.noEntries')}</td></tr>}
        </tbody>
      </table>
    </section>
  )
}
