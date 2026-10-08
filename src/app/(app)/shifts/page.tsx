'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, CalendarClock, CalendarDays, Edit, Plus, Printer, Trash2, WandSparkles } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmployeeSchedulePrint } from '@/components/schedules/employee-schedule-print'
import { WeeklyScheduleEditor, type LocationHours } from '@/components/schedules/weekly-schedule-editor'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { formatDateOnly, formatDateOnlyInput } from '@/lib/date-only'
import { buildShiftCandidates, classifyShiftCandidates, createDefaultWeeklySchedule, getWorkingMinutes, type ShiftCandidate, type WeeklyScheduleDay } from '@/lib/employee-scheduling'
import { getIntlLocale } from '@/lib/i18n'
import { isEmployeeNumberSchemaUnavailable } from '@/lib/employee-number'
import { createClient } from '@/lib/supabase-client'

const shiftStatuses = ['scheduled', 'completed', 'cancelled', 'missed'] as const
type ShiftStatus = typeof shiftStatuses[number]
interface EmployeeOption { id: string; name: string; employeeNumber?: string | null }
interface LocationOption { id: string; name: string }
interface Shift { id: string; company_id: string; employee_id: string; location_id: string | null; date: string; start_time: string; end_time: string; break_minutes: number; status: ShiftStatus; notes: string | null; employees?: EmployeeOption | null; locations?: LocationOption | null }
interface ShiftForm { employee_id: string; location_id: string; date: string; start_time: string; end_time: string; break_minutes: string; status: ShiftStatus; notes: string }
interface GeneratorForm { employee_id: string; from: string; to: string; mode: 'regular' | 'custom'; customSchedule: WeeklyScheduleDay[] }
interface StoredScheduleRow { weekday: number; is_working: boolean; start_time: string | null; end_time: string | null; break_minutes: number; location_id: string | null }

const today = () => formatDateOnlyInput()
const emptyShift = (): ShiftForm => ({ employee_id: '', location_id: '', date: today(), start_time: '09:00', end_time: '17:00', break_minutes: '30', status: 'scheduled', notes: '' })
const emptyGenerator = (): GeneratorForm => ({ employee_id: '', from: today(), to: today(), mode: 'regular', customSchedule: createDefaultWeeklySchedule() })

function mapStoredSchedule(rows: StoredScheduleRow[]) {
  const stored = new Map(rows.map((row) => [row.weekday, row]))
  return createDefaultWeeklySchedule().map((fallback) => {
    const row = stored.get(fallback.weekday)
    return row ? { weekday: row.weekday, isWorking: row.is_working, startTime: row.start_time?.slice(0, 5) ?? fallback.startTime, endTime: row.end_time?.slice(0, 5) ?? fallback.endTime, breakMinutes: Number(row.break_minutes), locationId: row.location_id ?? '' } : fallback
  })
}

export default function ShiftsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const intlLocale = getIntlLocale(locale)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationHours, setLocationHours] = useState<LocationHours[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [showRegularSchedule, setShowRegularSchedule] = useState(false)
  const [showPrintSettings, setShowPrintSettings] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [form, setForm] = useState<ShiftForm>(() => emptyShift())
  const [generator, setGenerator] = useState<GeneratorForm>(() => emptyGenerator())
  const [scheduleEmployeeId, setScheduleEmployeeId] = useState('')
  const [regularSchedule, setRegularSchedule] = useState<WeeklyScheduleDay[]>(() => createDefaultWeeklySchedule())
  const [preview, setPreview] = useState<ShiftCandidate[]>([])
  const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<Set<string>>(new Set())
  const [selectedPrintEmployees, setSelectedPrintEmployees] = useState<Set<string>>(new Set())
  const [fromDate, setFromDate] = useState(() => { const date = new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return formatDateOnlyInput(date) })
  const [toDate, setToDate] = useState(() => { const date = new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 7); return formatDateOnlyInput(date) })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null)
  useBodyScrollLock(preview.length > 0)

  const dataQueryKey = currentCompany ? `${currentCompany.id}:${fromDate}:${toDate}` : null
  const loading = dataQueryKey !== null && (loadedQueryKey !== dataQueryKey || refreshing)

  const loadData = useCallback(async (queryKey: string) => {
    if (!currentCompany) return
    const [employeeNumberResult, locationResult, hoursResult, shiftResult] = await Promise.all([
      supabase.from('employees').select('id, name, employee_number').eq('company_id', currentCompany.id).eq('status', 'active').order('name'),
      supabase.from('locations').select('id, name').eq('company_id', currentCompany.id).order('name'),
      supabase.from('location_operating_hours').select('location_id, weekday, is_open, opens_at, closes_at').eq('company_id', currentCompany.id),
      supabase.from('shifts').select('*, employees(id, name), locations(id, name)').eq('company_id', currentCompany.id).gte('date', fromDate).lte('date', toDate).order('date').order('start_time'),
    ])
    const employeeResult = isEmployeeNumberSchemaUnavailable(employeeNumberResult.error)
      ? await supabase.from('employees').select('id, name').eq('company_id', currentCompany.id).eq('status', 'active').order('name')
      : employeeNumberResult
    const loadError = employeeResult.error ?? locationResult.error ?? hoursResult.error ?? shiftResult.error
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setEmployees([]); setLocations([]); setLocationHours([]); setShifts([])
    } else {
      setEmployees((employeeResult.data ?? []) as EmployeeOption[])
      setLocations((locationResult.data ?? []) as LocationOption[])
      setLocationHours((hoursResult.data ?? []).filter((row) => row.opens_at && row.closes_at).map((row) => ({ locationId: row.location_id, weekday: row.weekday, isOpen: row.is_open, openTime: row.opens_at.slice(0, 5), closeTime: row.closes_at.slice(0, 5) })))
      setShifts((shiftResult.data ?? []).map((shift) => ({ ...shift, break_minutes: Number(shift.break_minutes) })) as unknown as Shift[])
    }
    setLoadedQueryKey(queryKey)
  }, [currentCompany, fromDate, supabase, t, toDate])

  useEffect(() => {
    if (dataQueryKey) void loadData(dataQueryKey)
  }, [dataQueryKey, loadData])

  const reloadData = async () => {
    if (!dataQueryKey) return
    setRefreshing(true)
    try {
      await loadData(dataQueryKey)
    } finally {
      setRefreshing(false)
    }
  }
  const groupedShifts = useMemo(() => shifts.reduce<Record<string, Shift[]>>((groups, shift) => ({ ...groups, [shift.date]: [...(groups[shift.date] ?? []), shift] }), {}), [shifts])
  const printableEmployeeIds = useMemo(() => [...new Set(shifts.map((shift) => shift.employee_id))], [shifts])
  const periodEmployees = useMemo(() => printableEmployeeIds.map((employeeId) => {
    const activeEmployee = employees.find((employee) => employee.id === employeeId)
    const shiftEmployee = shifts.find((shift) => shift.employee_id === employeeId)?.employees
    return activeEmployee ?? shiftEmployee ?? { id: employeeId, name: t('shifts.employee') }
  }), [employees, printableEmployeeIds, shifts, t])
  const printableEmployees = periodEmployees.filter((employee) => selectedPrintEmployees.has(employee.id))
  const printableShifts = shifts.filter((shift) => selectedPrintEmployees.has(shift.employee_id)).map((shift) => ({ id: shift.id, employee_id: shift.employee_id, date: shift.date, start_time: shift.start_time, end_time: shift.end_time, break_minutes: shift.break_minutes, locationName: shift.locations?.name ?? t('shifts.noLocation') }))

  const resetForm = () => { setEditing(null); setForm(emptyShift()); setShowForm(false) }
  const handleEdit = (shift: Shift) => { setEditing(shift); setForm({ employee_id: shift.employee_id, location_id: shift.location_id ?? '', date: shift.date, start_time: shift.start_time.slice(0, 5), end_time: shift.end_time.slice(0, 5), break_minutes: String(shift.break_minutes), status: shift.status, notes: shift.notes ?? '' }); setShowForm(true) }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage(''); setError('')
    if (!form.employee_id || !form.date || getWorkingMinutes(form.start_time, form.end_time, Number(form.break_minutes) || 0) === null) { setError(t('shifts.required')); return }
    const payload = { company_id: currentCompany.id, employee_id: form.employee_id, location_id: form.location_id || null, date: form.date, start_time: form.start_time, end_time: form.end_time, break_minutes: Math.max(0, Number(form.break_minutes) || 0), status: form.status, notes: form.notes.trim() || null, updated_at: new Date().toISOString() }
    const result = editing ? await supabase.from('shifts').update(payload).eq('id', editing.id).eq('company_id', currentCompany.id) : await supabase.from('shifts').insert(payload)
    if (result.error) { setError(result.error.code === '23505' ? t('shifts.duplicate') : result.error.message); return }
    setMessage(editing ? t('shifts.updated') : t('shifts.created')); resetForm(); await reloadData()
  }

  const loadRegularSchedule = async (employeeId: string) => {
    setScheduleEmployeeId(employeeId)
    if (!currentCompany || !employeeId) { setRegularSchedule(createDefaultWeeklySchedule()); return }
    const { data, error: scheduleError } = await supabase.from('employee_weekly_schedules').select('weekday, is_working, start_time, end_time, break_minutes, location_id').eq('company_id', currentCompany.id).eq('employee_id', employeeId).order('weekday')
    if (scheduleError) { setError(scheduleError.code === '42P01' ? t('modules.databaseRequired') : scheduleError.message); return }
    setRegularSchedule(mapStoredSchedule((data ?? []) as StoredScheduleRow[]))
  }

  const saveRegularSchedule = async () => {
    if (!currentCompany || !scheduleEmployeeId) { setError(t('shifts.selectEmployee')); return }
    if (regularSchedule.some((day) => day.isWorking && getWorkingMinutes(day.startTime, day.endTime, day.breakMinutes) === null)) { setError(t('shifts.required')); return }
    const payload = regularSchedule.map((day) => ({ company_id: currentCompany.id, employee_id: scheduleEmployeeId, weekday: day.weekday, is_working: day.isWorking, start_time: day.isWorking ? day.startTime : null, end_time: day.isWorking ? day.endTime : null, break_minutes: day.isWorking ? day.breakMinutes : 0, location_id: day.isWorking && day.locationId ? day.locationId : null, updated_at: new Date().toISOString() }))
    const { error: saveError } = await supabase.from('employee_weekly_schedules').upsert(payload, { onConflict: 'company_id,employee_id,weekday' })
    if (saveError) { setError(saveError.message); return }
    setMessage(t('schedule.regularSaved')); setShowRegularSchedule(false)
  }

  const fetchExistingWindows = async (employeeId: string, from: string, to: string) => {
    if (!currentCompany) return []
    const { data, error: queryError } = await supabase.from('shifts').select('id, date, start_time, end_time, status').eq('company_id', currentCompany.id).eq('employee_id', employeeId).gte('date', from).lte('date', to)
    if (queryError) throw queryError
    return (data ?? []).map((shift) => ({ id: shift.id, date: shift.date, startTime: shift.start_time, endTime: shift.end_time, status: shift.status }))
  }

  const prepareGeneration = async () => {
    setError('')
    if (!currentCompany || !generator.employee_id || !generator.from || !generator.to || generator.from > generator.to) { setError(t('shifts.generatorRequired')); return }
    let schedule = generator.customSchedule
    if (generator.mode === 'regular') {
      const { data, error: scheduleError } = await supabase.from('employee_weekly_schedules').select('weekday, is_working, start_time, end_time, break_minutes, location_id').eq('company_id', currentCompany.id).eq('employee_id', generator.employee_id)
      if (scheduleError) { setError(scheduleError.message); return }
      if (!data?.length) { setError(t('schedule.noReady')); return }
      schedule = mapStoredSchedule(data as StoredScheduleRow[])
    }
    const candidates = buildShiftCandidates(generator.from, generator.to, schedule)
    if (!candidates.length) { setError(t('schedule.noReady')); return }
    try {
      const classified = classifyShiftCandidates(candidates, await fetchExistingWindows(generator.employee_id, generator.from, generator.to))
      setPreview(classified); setSelectedPreviewKeys(new Set(classified.filter((candidate) => candidate.status === 'ready').map((candidate) => candidate.key)))
    } catch (queryError) { setError(queryError instanceof Error ? queryError.message : t('common.error')) }
  }

  const confirmGeneration = async () => {
    if (!currentCompany) return
    try {
      const rechecked = classifyShiftCandidates(preview, await fetchExistingWindows(generator.employee_id, generator.from, generator.to))
      if (rechecked.some((candidate, index) => candidate.status !== preview[index]?.status)) {
        setPreview(rechecked); setSelectedPreviewKeys(new Set(rechecked.filter((candidate) => candidate.status === 'ready' && selectedPreviewKeys.has(candidate.key)).map((candidate) => candidate.key))); setError(t('schedule.recheckConflict')); return
      }
      const selected = rechecked.filter((candidate) => candidate.status === 'ready' && selectedPreviewKeys.has(candidate.key))
      if (!selected.length) { setError(t('schedule.noReady')); return }
      const payload = selected.map((candidate) => ({ company_id: currentCompany.id, employee_id: generator.employee_id, location_id: candidate.locationId || null, date: candidate.date, start_time: candidate.startTime, end_time: candidate.endTime, break_minutes: candidate.breakMinutes, status: 'scheduled' as const }))
      const { error: insertError } = await supabase.from('shifts').insert(payload)
      if (insertError) { setError(insertError.code === '23505' ? t('shifts.generatorDuplicates') : insertError.message); return }
      const skipped = rechecked.length - payload.length
      setPreview([]); setSelectedPreviewKeys(new Set()); setMessage(`${t('shifts.generated').replace('{count}', String(payload.length))}${skipped ? ` ${t('schedule.conflictsSkipped').replace('{count}', String(skipped))}` : ''}`); setShowGenerator(false); await reloadData()
    } catch (queryError) { setError(queryError instanceof Error ? queryError.message : t('common.error')) }
  }

  const handleDelete = async () => {
    if (!currentCompany || !deleteTarget) return
    const { error: deleteError } = await supabase.from('shifts').delete().eq('id', deleteTarget.id).eq('company_id', currentCompany.id)
    setDeleteTarget(null)
    if (deleteError) setError(deleteError.message); else { setMessage(t('shifts.deleted')); await reloadData() }
  }

  const printSchedule = () => { if (!selectedPrintEmployees.size) setError(t('schedule.printRequired')); else window.print() }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('shifts.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('shifts.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('shifts.title')} description={`${t('shifts.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowPrintSettings((value) => !value)}><Printer className="h-4 w-4" />{t('schedule.print')}</Button>
          <Button variant="outline" onClick={() => setShowRegularSchedule((value) => !value)}><CalendarClock className="h-4 w-4" />{t('schedule.editRegular')}</Button>
          <Button variant="outline" onClick={() => setShowGenerator((value) => !value)}><WandSparkles className="h-4 w-4" />{t('shifts.generate')}</Button>
          <Button onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="h-4 w-4" />{showForm ? t('common.cancel') : t('shifts.add')}</Button>
        </div>
      </PageHeader>

      <div className="mb-5 grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-white p-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        <label className="min-w-0 space-y-1 text-sm"><span>{t('common.from')}</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="w-full min-w-0 rounded-md border px-3 py-2" /></label>
        <label className="min-w-0 space-y-1 text-sm"><span>{t('common.to')}</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="w-full min-w-0 rounded-md border px-3 py-2" /></label>
        <Link href="/app/employees" className="min-w-0"><Button variant="outline" className="w-full whitespace-normal lg:w-auto">{t('employees.title')}</Button></Link>
        <Link href="/app/locations" className="min-w-0"><Button variant="outline" className="w-full whitespace-normal lg:w-auto">{t('locations.title')}</Button></Link>
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showPrintSettings && <Card className="mb-6"><CardHeader><CardTitle>{t('schedule.print')}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm font-medium">{t('schedule.printEmployees')}</p><label className="flex items-center gap-2"><input type="checkbox" checked={printableEmployeeIds.length > 0 && printableEmployeeIds.every((id) => selectedPrintEmployees.has(id))} onChange={(event) => setSelectedPrintEmployees(event.target.checked ? new Set(printableEmployeeIds) : new Set())} />{t('schedule.printAll')}</label><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{periodEmployees.map((employee) => <label key={employee.id} className="flex items-center gap-2 rounded-md border px-3 py-2"><input type="checkbox" checked={selectedPrintEmployees.has(employee.id)} onChange={(event) => setSelectedPrintEmployees((current) => { const next = new Set(current); if (event.target.checked) next.add(employee.id); else next.delete(employee.id); return next })} />{employee.name}</label>)}</div>{printableEmployeeIds.length ? <Button onClick={printSchedule}><Printer className="h-4 w-4" />{t('common.print')}</Button> : <p className="text-sm text-slate-500">{t('schedule.noShiftsToPrint')}</p>}</CardContent></Card>}

      {showRegularSchedule && <Card className="mb-6"><CardHeader><CardTitle>{t('schedule.regular')}</CardTitle></CardHeader><CardContent className="space-y-4"><label className="block max-w-md space-y-1"><span className="text-sm font-medium">{t('shifts.employee')}</span><AppSelect value={scheduleEmployeeId} onChange={(value) => void loadRegularSchedule(value)} options={[{ value: '', label: t('shifts.selectEmployee'), disabled: true }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} /></label>{scheduleEmployeeId && <><WeeklyScheduleEditor value={regularSchedule} onChange={setRegularSchedule} locations={locations} locationHours={locationHours} t={t} /><Button onClick={() => void saveRegularSchedule()}>{t('schedule.saveRegular')}</Button></>}</CardContent></Card>}

      {showGenerator && <Card className="mb-6"><CardHeader><CardTitle>{t('shifts.generate')}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.employee')}</span><AppSelect value={generator.employee_id} onChange={(value) => setGenerator({ ...generator, employee_id: value })} options={[{ value: '', label: t('shifts.selectEmployee'), disabled: true }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} /></label><label className="space-y-1"><span className="text-sm font-medium">{t('schedule.generatorMode')}</span><AppSelect value={generator.mode} onChange={(value) => setGenerator({ ...generator, mode: value as GeneratorForm['mode'] })} options={[{ value: 'regular', label: t('schedule.useRegular') }, { value: 'custom', label: t('schedule.customDays') }]} /></label><label className="space-y-1"><span className="text-sm font-medium">{t('common.from')}</span><input type="date" value={generator.from} onChange={(event) => setGenerator({ ...generator, from: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('common.to')}</span><input type="date" value={generator.to} onChange={(event) => setGenerator({ ...generator, to: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label></div>{generator.mode === 'custom' && <WeeklyScheduleEditor value={generator.customSchedule} onChange={(customSchedule) => setGenerator({ ...generator, customSchedule })} locations={locations} locationHours={locationHours} t={t} />}<Button type="button" onClick={() => void prepareGeneration()}>{t('shifts.previewGeneration')}</Button></CardContent></Card>}

      {showForm && <ShiftEditorCard editing={editing} form={form} setForm={setForm} employees={employees} locations={locations} t={t} onSubmit={handleSubmit} onCancel={resetForm} />}

      {shifts.length === 0 ? <EmptyState icon={CalendarDays} title={t('shifts.empty')} description={t('shifts.emptyDescription')} /> : <div className="space-y-5">{Object.entries(groupedShifts).map(([date, dayShifts]) => <section key={date}><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{formatDateOnly(date, intlLocale, { weekday: 'long', day: '2-digit', month: 'long' })}</h2><div className="space-y-2">{dayShifts.map((shift) => <Card key={shift.id}><CardContent className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium">{shift.employees?.name ?? t('shifts.employee')}</p><p className="break-words text-sm text-slate-500">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.locations?.name ?? t('shifts.noLocation')} · {t(`shifts.status.${shift.status}`)}</p></div><div className="flex shrink-0 gap-2"><Button size="icon" variant="outline" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => handleEdit(shift)}><Edit className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label={t('common.delete')} title={t('common.delete')} onClick={() => setDeleteTarget(shift)}><Trash2 className="h-4 w-4" /></Button></div></CardContent></Card>)}</div></section>)}</div>}

      <EmployeeSchedulePrint workspaceName={currentCompany.name} from={fromDate} to={toDate} employees={printableEmployees} shifts={printableShifts} intlLocale={intlLocale} t={t} />
      {preview.length > 0 && <ShiftPreview candidates={preview} selected={selectedPreviewKeys} setSelected={setSelectedPreviewKeys} locations={locations} intlLocale={intlLocale} t={t} onCancel={() => { setPreview([]); setSelectedPreviewKeys(new Set()) }} onConfirm={() => void confirmGeneration()} />}
      <ConfirmDialog open={Boolean(deleteTarget)} title={t('common.confirmDelete')} description={t('shifts.deleteConfirm')} confirmLabel={t('common.deleteAnyway')} cancelLabel={t('common.cancel')} destructive onCancel={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
    </PageContainer>
  )
}

function ShiftEditorCard({ editing, form, setForm, employees, locations, t, onSubmit, onCancel }: { editing: Shift | null; form: ShiftForm; setForm: (form: ShiftForm) => void; employees: EmployeeOption[]; locations: LocationOption[]; t: (key: string) => string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void }) {
  return <Card className="mb-6"><CardHeader><CardTitle>{editing ? t('shifts.edit') : t('shifts.add')}</CardTitle></CardHeader><CardContent><form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.employee')}</span><AppSelect value={form.employee_id} onChange={(value) => setForm({ ...form, employee_id: value })} options={[{ value: '', label: t('shifts.selectEmployee'), disabled: true }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.location')}</span><AppSelect value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })} options={[{ value: '', label: t('shifts.noLocation') }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} /></label><label className="space-y-1"><span className="text-sm font-medium">{t('common.date')}</span><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.status')}</span><AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as ShiftStatus })} options={shiftStatuses.map((status) => ({ value: status, label: t(`shifts.status.${status}`) }))} /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.startTime')}</span><input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.endTime')}</span><input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.breakMinutes')}</span><input type="number" min="0" value={form.break_minutes} onChange={(event) => setForm({ ...form, break_minutes: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><label className="space-y-1"><span className="text-sm font-medium">{t('shifts.notes')}</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-md border px-3 py-2" /></label><div className="flex gap-2 md:col-span-2 xl:col-span-4"><Button type="submit">{t('common.save')}</Button><Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel')}</Button></div></form></CardContent></Card>
}

function ShiftPreview({ candidates, selected, setSelected, locations, intlLocale, t, onCancel, onConfirm }: { candidates: ShiftCandidate[]; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>>; locations: LocationOption[]; intlLocale: string; t: (key: string) => string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/50 px-3 py-[max(1rem,env(safe-area-inset-top))]"><div className="mx-auto w-full max-w-5xl rounded-lg bg-white p-4 shadow-xl sm:p-6"><h2 className="text-xl font-semibold">{t('schedule.preview')}</h2><p className="mt-1 text-sm text-slate-600">{t('schedule.previewDescription')}</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="border-b text-left"><th className="p-2"></th><th className="p-2">{t('common.date')}</th><th className="p-2">{t('schedule.day')}</th><th className="p-2">{t('shifts.startTime')}</th><th className="p-2">{t('shifts.endTime')}</th><th className="p-2">{t('schedule.break')}</th><th className="p-2">{t('shifts.location')}</th><th className="p-2">{t('shifts.status')}</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.key} className="border-b"><td className="p-2"><input type="checkbox" disabled={candidate.status !== 'ready'} checked={selected.has(candidate.key)} aria-label={t('schedule.selectReady').replace('{date}', candidate.date)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(candidate.key); else next.delete(candidate.key); return next })} /></td><td className="p-2">{formatDateOnly(candidate.date, intlLocale)}</td><td className="p-2">{t(`shifts.weekday.${candidate.weekday}`)}</td><td className="p-2">{candidate.startTime}</td><td className="p-2">{candidate.endTime}</td><td className="p-2">{candidate.breakMinutes} min</td><td className="p-2">{locations.find((location) => location.id === candidate.locationId)?.name ?? t('shifts.noLocation')}</td><td className="p-2 font-medium">{t(`schedule.${candidate.status}`)}</td></tr>)}</tbody></table></div><div className="mt-5 flex flex-col justify-end gap-2 sm:flex-row"><Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button><Button disabled={!selected.size} onClick={onConfirm}>{t('shifts.createGenerated')} ({selected.size})</Button></div></div></div>
}
