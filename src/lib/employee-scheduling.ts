// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { enumerateDateOnlyRange, parseDateOnly } from './date-only.ts'

export interface WeeklyScheduleDay {
  weekday: number
  isWorking: boolean
  startTime: string
  endTime: string
  breakMinutes: number
  locationId: string
}

export interface ExistingShiftWindow {
  id: string
  date: string
  startTime: string
  endTime: string
  status?: string
}

export type ShiftCandidateStatus = 'ready' | 'duplicate' | 'overlap' | 'invalid'

export interface ShiftCandidate {
  key: string
  date: string
  weekday: number
  startTime: string
  endTime: string
  breakMinutes: number
  locationId: string
  status: ShiftCandidateStatus
}

export const createDefaultWeeklySchedule = (): WeeklyScheduleDay[] =>
  [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    isWorking: weekday >= 1 && weekday <= 5,
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    locationId: '',
  }))

const toMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function getWorkingMinutes(startTime: string, endTime: string, breakMinutes: number) {
  const start = toMinutes(startTime)
  const end = toMinutes(endTime)
  if (start === null || end === null || end <= start || breakMinutes < 0 || breakMinutes >= end - start) return null
  return end - start - breakMinutes
}

export function buildShiftCandidates(from: string, to: string, schedule: WeeklyScheduleDay[]) {
  const byWeekday = new Map(schedule.map((day) => [day.weekday, day]))
  const workingDays = schedule.filter((day) => day.isWorking).map((day) => day.weekday)

  return enumerateDateOnlyRange(from, to, workingDays).map<ShiftCandidate>((date) => {
    const parsed = parseDateOnly(date)
    const weekday = parsed?.getUTCDay() ?? -1
    const day = byWeekday.get(weekday)
    const valid = day && getWorkingMinutes(day.startTime, day.endTime, day.breakMinutes) !== null
    return {
      key: `${date}-${weekday}`,
      date,
      weekday,
      startTime: day?.startTime ?? '',
      endTime: day?.endTime ?? '',
      breakMinutes: day?.breakMinutes ?? 0,
      locationId: day?.locationId ?? '',
      status: valid ? 'ready' : 'invalid',
    }
  })
}

export function classifyShiftCandidates(candidates: ShiftCandidate[], existing: ExistingShiftWindow[]) {
  return candidates.map<ShiftCandidate>((candidate, index) => {
    if (candidate.status === 'invalid') return candidate
    const sameDay = existing.filter((shift) => shift.date === candidate.date && shift.status !== 'cancelled')
    const duplicate = sameDay.some((shift) => shift.startTime.slice(0, 5) === candidate.startTime && shift.endTime.slice(0, 5) === candidate.endTime)
    if (duplicate) return { ...candidate, status: 'duplicate' }

    const start = toMinutes(candidate.startTime) ?? 0
    const end = toMinutes(candidate.endTime) ?? 0
    const overlap = sameDay.some((shift) => {
      const existingStart = toMinutes(shift.startTime) ?? 0
      const existingEnd = toMinutes(shift.endTime) ?? 0
      return start < existingEnd && end > existingStart
    }) || candidates.slice(0, index).some((other) => {
      if (other.date !== candidate.date || other.status === 'invalid') return false
      const otherStart = toMinutes(other.startTime) ?? 0
      const otherEnd = toMinutes(other.endTime) ?? 0
      return start < otherEnd && end > otherStart
    })

    return { ...candidate, status: overlap ? 'overlap' : 'ready' }
  })
}

export function formatWorkingDuration(minutes: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  return `${formatter.format(minutes / 60)} h`
}
