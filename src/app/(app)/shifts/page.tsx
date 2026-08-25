'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, CalendarDays, Edit, Plus, Trash2, WandSparkles } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

const shiftStatuses = ['scheduled', 'completed', 'cancelled', 'missed'] as const
type ShiftStatus = typeof shiftStatuses[number]

interface EmployeeOption { id: string; name: string }
interface LocationOption { id: string; name: string }
interface Shift {
  id: string
  company_id: string
  employee_id: string
  location_id: string | null
  date: string
  start_time: string
  end_time: string
  break_minutes: number
  status: ShiftStatus
  notes: string | null
  employees?: EmployeeOption | null
  locations?: LocationOption | null
}

interface ShiftForm {
  employee_id: string
  location_id: string
  date: string
  start_time: string
  end_time: string
  break_minutes: string
  status: ShiftStatus
  notes: string
}

interface GeneratorForm {
  employee_id: string
  location_id: string
  from: string
  to: string
  weekdays: number[]
  start_time: string
  end_time: string
  break_minutes: string
}

const today = () => new Date().toISOString().split('T')[0]
const emptyShift: ShiftForm = { employee_id: '', location_id: '', date: today(), start_time: '09:00', end_time: '17:00', break_minutes: '30', status: 'scheduled', notes: '' }
const emptyGenerator: GeneratorForm = { employee_id: '', location_id: '', from: today(), to: today(), weekdays: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '17:00', break_minutes: '30' }

function enumerateDates(from: string, to: string, weekdays: number[]) {
  const dates: string[] = []
  const cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cursor <= end) {
    if (weekdays.includes(cursor.getDay())) dates.push(cursor.toISOString().split('T')[0])
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export default function ShiftsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [form, setForm] = useState<ShiftForm>(emptyShift)
  const [generator, setGenerator] = useState<GeneratorForm>(emptyGenerator)
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date()
    const day = date.getDay() || 7
    date.setDate(date.getDate() - day + 1)
    return date.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => {
    const date = new Date()
    const day = date.getDay() || 7
    date.setDate(date.getDate() - day + 7)
    return date.toISOString().split('T')[0]
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null)
  const [pendingGeneratedDates, setPendingGeneratedDates] = useState<string[]>([])

  const loadData = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [employeeResult, locationResult, shiftResult] = await Promise.all([
      supabase.from('employees').select('id, name').eq('company_id', currentCompany.id).eq('status', 'active').order('name'),
      supabase.from('locations').select('id, name').eq('company_id', currentCompany.id).order('name'),
      supabase.from('shifts').select('*, employees(id, name), locations(id, name)').eq('company_id', currentCompany.id).gte('date', fromDate).lte('date', toDate).order('date').order('start_time'),
    ])
    const loadError = employeeResult.error ?? locationResult.error ?? shiftResult.error
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setEmployees([])
      setLocations([])
      setShifts([])
    } else {
      setEmployees((employeeResult.data ?? []) as EmployeeOption[])
      setLocations((locationResult.data ?? []) as LocationOption[])
      setShifts((shiftResult.data ?? []).map((shift) => ({ ...shift, break_minutes: Number(shift.break_minutes) })) as unknown as Shift[])
    }
    setLoading(false)
  }, [currentCompany, fromDate, supabase, t, toDate])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadData()
    })
    return () => { cancelled = true }
  }, [loadData])

  const groupedShifts = useMemo(() => shifts.reduce<Record<string, Shift[]>>((groups, shift) => ({
    ...groups,
    [shift.date]: [...(groups[shift.date] ?? []), shift],
  }), {}), [shifts])

  const resetForm = () => {
    setEditing(null)
    setForm(emptyShift)
    setShowForm(false)
  }

  const handleEdit = (shift: Shift) => {
    setEditing(shift)
    setForm({
      employee_id: shift.employee_id,
      location_id: shift.location_id ?? '',
      date: shift.date,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      break_minutes: String(shift.break_minutes),
      status: shift.status,
      notes: shift.notes ?? '',
    })
    setShowForm(true)
  }

  const validateTimes = (start: string, end: string) => start && end && end > start

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')
    if (!form.employee_id || !form.date || !validateTimes(form.start_time, form.end_time)) {
      setError(t('shifts.required'))
      return
    }
    const payload = {
      company_id: currentCompany.id,
      employee_id: form.employee_id,
      location_id: form.location_id || null,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      break_minutes: Math.max(0, Number(form.break_minutes) || 0),
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const result = editing
      ? await supabase.from('shifts').update(payload).eq('id', editing.id).eq('company_id', currentCompany.id)
      : await supabase.from('shifts').insert(payload)
    if (result.error) {
      setError(result.error.code === '23505' ? t('shifts.duplicate') : result.error.message)
      return
    }
    setMessage(editing ? t('shifts.updated') : t('shifts.created'))
    resetForm()
    await loadData()
  }

  const prepareGeneration = () => {
    setError('')
    if (!generator.employee_id || !generator.from || !generator.to || generator.from > generator.to || generator.weekdays.length === 0 || !validateTimes(generator.start_time, generator.end_time)) {
      setError(t('shifts.generatorRequired'))
      return
    }
    setPendingGeneratedDates(enumerateDates(generator.from, generator.to, generator.weekdays))
  }

  const confirmGeneration = async () => {
    if (!currentCompany || pendingGeneratedDates.length === 0) return
    const payload = pendingGeneratedDates.map((date) => ({
      company_id: currentCompany.id,
      employee_id: generator.employee_id,
      location_id: generator.location_id || null,
      date,
      start_time: generator.start_time,
      end_time: generator.end_time,
      break_minutes: Math.max(0, Number(generator.break_minutes) || 0),
      status: 'scheduled',
    }))
    const { error: insertError } = await supabase.from('shifts').insert(payload)
    setPendingGeneratedDates([])
    if (insertError) {
      setError(insertError.code === '23505' ? t('shifts.generatorDuplicates') : insertError.message)
      return
    }
    setMessage(t('shifts.generated').replace('{count}', String(payload.length)))
    setShowGenerator(false)
    await loadData()
  }

  const handleDelete = async () => {
    if (!currentCompany || !deleteTarget) return
    const { error: deleteError } = await supabase.from('shifts').delete().eq('id', deleteTarget.id).eq('company_id', currentCompany.id)
    setDeleteTarget(null)
    if (deleteError) setError(deleteError.message)
    else {
      setMessage(t('shifts.deleted'))
      await loadData()
    }
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('shifts.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('shifts.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('shifts.title')} description={`${t('shifts.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowGenerator((value) => !value)}><WandSparkles className="h-4 w-4" />{t('shifts.generate')}</Button>
          <Button onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="h-4 w-4" />{showForm ? t('common.cancel') : t('shifts.add')}</Button>
        </div>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-3">
        <label className="space-y-1 text-sm"><span>{t('common.from')}</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-md border px-3 py-2" /></label>
        <label className="space-y-1 text-sm"><span>{t('common.to')}</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-md border px-3 py-2" /></label>
        <Link href="/app/employees"><Button variant="outline">{t('employees.title')}</Button></Link>
        <Link href="/app/locations"><Button variant="outline">{t('locations.title')}</Button></Link>
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showGenerator && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{t('shifts.generate')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.employee')}</span><AppSelect value={generator.employee_id} onChange={(value) => setGenerator({ ...generator, employee_id: value })} options={[{ value: '', label: t('shifts.selectEmployee'), disabled: true }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.location')}</span><AppSelect value={generator.location_id} onChange={(value) => setGenerator({ ...generator, location_id: value })} options={[{ value: '', label: t('shifts.noLocation') }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('common.from')}</span><input type="date" value={generator.from} onChange={(e) => setGenerator({ ...generator, from: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('common.to')}</span><input type="date" value={generator.to} onChange={(e) => setGenerator({ ...generator, to: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.startTime')}</span><input type="time" value={generator.start_time} onChange={(e) => setGenerator({ ...generator, start_time: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.endTime')}</span><input type="time" value={generator.end_time} onChange={(e) => setGenerator({ ...generator, end_time: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.breakMinutes')}</span><input type="number" min="0" value={generator.break_minutes} onChange={(e) => setGenerator({ ...generator, break_minutes: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
            </div>
            <div><p className="mb-2 text-sm font-medium">{t('shifts.weekdays')}</p><div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map((day) => <label key={day} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={generator.weekdays.includes(day)} onChange={(e) => setGenerator({ ...generator, weekdays: e.target.checked ? [...generator.weekdays, day] : generator.weekdays.filter((value) => value !== day) })} />{t(`shifts.weekday.${day}`)}</label>)}</div></div>
            <Button type="button" onClick={prepareGeneration}>{t('shifts.previewGeneration')}</Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editing ? t('shifts.edit') : t('shifts.add')}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.employee')}</span><AppSelect value={form.employee_id} onChange={(value) => setForm({ ...form, employee_id: value })} options={[{ value: '', label: t('shifts.selectEmployee'), disabled: true }, ...employees.map((employee) => ({ value: employee.id, label: employee.name }))]} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.location')}</span><AppSelect value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })} options={[{ value: '', label: t('shifts.noLocation') }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('common.date')}</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.status')}</span><AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as ShiftStatus })} options={shiftStatuses.map((status) => ({ value: status, label: t(`shifts.status.${status}`) }))} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.startTime')}</span><input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.endTime')}</span><input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.breakMinutes')}</span><input type="number" min="0" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('shifts.notes')}</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <div className="flex gap-2 md:col-span-2 xl:col-span-4"><Button type="submit">{t('common.save')}</Button><Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {shifts.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t('shifts.empty')} description={t('shifts.emptyDescription')} />
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedShifts).map(([date, dayShifts]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' })}</h2>
              <div className="space-y-2">
                {dayShifts.map((shift) => (
                  <Card key={shift.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{shift.employees?.name ?? t('shifts.employee')}</p><p className="text-sm text-slate-500">{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.locations?.name ?? t('shifts.noLocation')} · {t(`shifts.status.${shift.status}`)}</p></div><div className="flex gap-2"><Button size="icon" variant="outline" onClick={() => handleEdit(shift)}><Edit className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => setDeleteTarget(shift)}><Trash2 className="h-4 w-4" /></Button></div></CardContent></Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog open={pendingGeneratedDates.length > 0} title={t('shifts.confirmGeneration')} description={t('shifts.confirmGenerationDescription').replace('{count}', String(pendingGeneratedDates.length))} confirmLabel={t('shifts.createGenerated')} cancelLabel={t('common.cancel')} onCancel={() => setPendingGeneratedDates([])} onConfirm={() => void confirmGeneration()} />
      <ConfirmDialog open={Boolean(deleteTarget)} title={t('common.confirmDelete')} description={t('shifts.deleteConfirm')} confirmLabel={t('common.deleteAnyway')} cancelLabel={t('common.cancel')} destructive onCancel={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
    </PageContainer>
  )
}
