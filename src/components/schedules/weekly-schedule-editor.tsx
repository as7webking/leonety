'use client'

import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import type { WeeklyScheduleDay } from '@/lib/employee-scheduling'

export interface ScheduleLocation { id: string; name: string }
export interface LocationHours { locationId: string; weekday: number; isOpen: boolean; openTime: string; closeTime: string }

interface WeeklyScheduleEditorProps {
  value: WeeklyScheduleDay[]
  onChange: (value: WeeklyScheduleDay[]) => void
  locations: ScheduleLocation[]
  locationHours: LocationHours[]
  t: (key: string) => string
}

export function WeeklyScheduleEditor({ value, onChange, locations, locationHours, t }: WeeklyScheduleEditorProps) {
  const updateDay = (weekday: number, patch: Partial<WeeklyScheduleDay>) => {
    onChange(value.map((day) => day.weekday === weekday ? { ...day, ...patch } : day))
  }

  return (
    <div className="space-y-3">
      {value.map((day) => {
        const suggestion = locationHours.find((hours) => hours.locationId === day.locationId && hours.weekday === day.weekday && hours.isOpen)
        return (
          <div key={day.weekday} className="grid min-w-0 gap-3 rounded-md border p-3 md:grid-cols-[8rem_8rem_1fr_1fr_8rem_1.2fr] md:items-end">
            <div className="font-medium">{t(`shifts.weekday.${day.weekday}`)}</div>
            <AppSelect
              value={day.isWorking ? 'working' : 'off'}
              onChange={(state) => updateDay(day.weekday, { isWorking: state === 'working' })}
              options={[{ value: 'working', label: t('schedule.working') }, { value: 'off', label: t('schedule.off') }]}
            />
            {day.isWorking ? (
              <>
                <label className="min-w-0 space-y-1"><span className="text-xs text-slate-600">{t('shifts.startTime')}</span><input type="time" value={day.startTime} onChange={(event) => updateDay(day.weekday, { startTime: event.target.value })} className="w-full min-w-0 rounded-md border px-3 py-2" /></label>
                <label className="min-w-0 space-y-1"><span className="text-xs text-slate-600">{t('shifts.endTime')}</span><input type="time" value={day.endTime} onChange={(event) => updateDay(day.weekday, { endTime: event.target.value })} className="w-full min-w-0 rounded-md border px-3 py-2" /></label>
                <label className="min-w-0 space-y-1"><span className="text-xs text-slate-600">{t('shifts.breakMinutes')}</span><input type="number" min="0" value={day.breakMinutes} onChange={(event) => updateDay(day.weekday, { breakMinutes: Math.max(0, Number(event.target.value) || 0) })} className="w-full min-w-0 rounded-md border px-3 py-2" /></label>
                <div className="min-w-0 space-y-1">
                  <span className="text-xs text-slate-600">{t('shifts.location')}</span>
                  <AppSelect value={day.locationId} onChange={(locationId) => updateDay(day.weekday, { locationId })} options={[{ value: '', label: t('shifts.noLocation') }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} />
                  {day.locationId && (
                    <Button type="button" size="sm" variant="ghost" className="h-auto whitespace-normal px-1 py-1 text-left text-xs" disabled={!suggestion} title={!suggestion ? t('schedule.locationHoursUnavailable') : undefined} onClick={() => suggestion && updateDay(day.weekday, { startTime: suggestion.openTime, endTime: suggestion.closeTime })}>
                      {t('schedule.useLocationHours')}
                    </Button>
                  )}
                </div>
              </>
            ) : <p className="text-sm text-slate-500 md:col-span-4">{t('schedule.off')}</p>}
          </div>
        )
      })}
    </div>
  )
}
