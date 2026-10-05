import { formatDateOnly } from '@/lib/date-only'
import { formatWorkingDuration, getWorkingMinutes } from '@/lib/employee-scheduling'
import styles from './employee-schedule-print.module.css'

export interface PrintableEmployee { id: string; name: string; employeeNumber?: string | null }
export interface PrintableShift {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  locationName: string
}

interface EmployeeSchedulePrintProps {
  workspaceName: string
  from: string
  to: string
  employees: PrintableEmployee[]
  shifts: PrintableShift[]
  intlLocale: string
  t: (key: string) => string
}

export function EmployeeSchedulePrint({ workspaceName, from, to, employees, shifts, intlLocale, t }: EmployeeSchedulePrintProps) {
  const selected = employees.map((employee) => ({ employee, shifts: shifts.filter((shift) => shift.employee_id === employee.id) })).filter((group) => group.shifts.length > 0)

  return (
    <div className={`print-area ${styles.root}`} aria-hidden="true">
      {selected.map(({ employee, shifts: employeeShifts }, index) => {
        const totalMinutes = employeeShifts.reduce((sum, shift) => sum + (getWorkingMinutes(shift.start_time, shift.end_time, shift.break_minutes) ?? 0), 0)
        return (
          <article key={employee.id} className={styles.page} data-final-page={index === selected.length - 1 ? 'true' : 'false'}>
            <header className={styles.header}>
              <div><p className={styles.workspace}>{workspaceName}</p><h1>{t('schedule.printTitle')}</h1></div>
              <div className={styles.meta}><strong>{employee.name}</strong>{employee.employeeNumber && <span>{t('schedule.personalNumber')}: {employee.employeeNumber}</span>}<span>{t('schedule.period')}: {formatDateOnly(from, intlLocale)} – {formatDateOnly(to, intlLocale)}</span></div>
            </header>
            <table className={styles.table}>
              <thead><tr><th>{t('common.date')}</th><th>{t('schedule.day')}</th><th>{t('shifts.startTime')}</th><th>{t('shifts.endTime')}</th><th>{t('schedule.break')}</th><th>{t('shifts.location')}</th><th>{t('schedule.duration')}</th></tr></thead>
              <tbody>{employeeShifts.map((shift) => {
                const minutes = getWorkingMinutes(shift.start_time, shift.end_time, shift.break_minutes) ?? 0
                return <tr key={shift.id}><td>{formatDateOnly(shift.date, intlLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })}</td><td>{formatDateOnly(shift.date, intlLocale, { weekday: 'long' })}</td><td>{shift.start_time.slice(0, 5)}</td><td>{shift.end_time.slice(0, 5)}</td><td>{shift.break_minutes} min</td><td>{shift.locationName}</td><td>{formatWorkingDuration(minutes, intlLocale)}</td></tr>
              })}</tbody>
              <tfoot><tr><td colSpan={6}>{t('schedule.weeklyTotal')}</td><td>{formatWorkingDuration(totalMinutes, intlLocale)}</td></tr></tfoot>
            </table>
          </article>
        )
      })}
    </div>
  )
}
