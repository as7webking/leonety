'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageContainer, PageHeader, EmptyState, LoadingSkeleton } from "@/components"
import { Building2, CheckCircle2, Clock, Edit, Pause, Play, Trash2 } from "lucide-react"
import { createClient } from '@/lib/supabase-client'
import { timeEntrySchema, type TimeEntryForm } from '@/lib/validations'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'

interface TimeEntry {
  id: string
  company_id: string
  description: string
  hours: number
  date: string
  created_at?: string
  timer_started_at?: string | null
  timer_completed_at?: string | null
}

interface ActiveTimer {
  id: string
  company_id: string
  user_id?: string
  description: string
  started_at: string
  first_started_at?: string | null
  paused_at: string | null
  accumulated_seconds: number
  pause_events?: TimerPauseEvent[] | null
}

interface TimerPauseEvent {
  started_at?: string | null
  paused_at?: string | null
  resumed_at?: string | null
}

const MAX_ACTIVE_TIMERS = 7

function formatSupabaseError(error: unknown) {
  if (error && typeof error === 'object') {
    const maybe = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }

    return {
      message: maybe.message ?? 'Unknown Supabase error',
      details: maybe.details ?? '',
      hint: maybe.hint ?? '',
      code: maybe.code ?? '',
    }
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown error',
    details: '',
    hint: '',
    code: '',
  }
}

export default function TimePage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [activeTimers, setActiveTimers] = useState<ActiveTimer[]>([])
  const [loading, setLoading] = useState(true)
  const [newTimerDescription, setNewTimerDescription] = useState('')
  const [rounding, setRounding] = useState<'none' | 'hour' | 'day'>('none')
  const [now, setNow] = useState(Date.now())
  const [timerError, setTimerError] = useState('')
  const [timerInfo, setTimerInfo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [importing, setImporting] = useState(false)
  const [startingTimer, setStartingTimer] = useState(false)
  const [formData, setFormData] = useState<TimeEntryForm>({
    description: '',
    hours: 0,
    minutes: 0,
    date: new Date().toISOString().split('T')[0],
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const sortTimeEntries = (entries: TimeEntry[]) =>
    [...entries].sort((left, right) => {
      const leftCreatedAt = left.created_at ? new Date(left.created_at).getTime() : 0
      const rightCreatedAt = right.created_at ? new Date(right.created_at).getTime() : 0

      if (rightCreatedAt !== leftCreatedAt) {
        return rightCreatedAt - leftCreatedAt
      }

      return new Date(right.date).getTime() - new Date(left.date).getTime()
    })

  const computeElapsedSeconds = (timer: ActiveTimer) => {
    const accumulatedSeconds = Number(timer.accumulated_seconds ?? 0)
    const startedAt = new Date(timer.started_at).getTime()

    if (Number.isNaN(startedAt)) {
      return Math.max(0, accumulatedSeconds)
    }

    if (timer.paused_at) {
      return Math.max(0, accumulatedSeconds)
    }

    return Math.max(0, accumulatedSeconds + Math.floor((now - startedAt) / 1000))
  }

  const formatTimer = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getFirstStartedAt = (timer: ActiveTimer) => timer.first_started_at || timer.started_at

  const formatPauseEvent = (event: TimerPauseEvent, index: number) => {
    const startedAt = event.started_at ? new Date(event.started_at).toLocaleString() : 'unknown start'
    const pausedAt = event.paused_at ? new Date(event.paused_at).toLocaleString() : 'unknown pause'
    const resumedAt = event.resumed_at ? new Date(event.resumed_at).toLocaleString() : null

    return `Pause ${index + 1}: ${startedAt} to ${pausedAt}${resumedAt ? ` · resumed ${resumedAt}` : ''}`
  }

  const completeActiveTimer = async (timerId: string) => {
    const primaryResult = await supabase.rpc('stop_active_timer', { p_timer_id: timerId })

    if (!primaryResult.error) {
      return primaryResult
    }

    const formatted = formatSupabaseError(primaryResult.error)
    const mayBeLegacySignature =
      formatted.code === 'PGRST202' ||
      formatted.message.toLowerCase().includes('p_user_id') ||
      formatted.message.toLowerCase().includes('schema cache')

    if (!mayBeLegacySignature) {
      return primaryResult
    }

    return supabase.rpc('stop_active_timer', { p_user_id: timerId })
  }

  const formatHours = (hoursValue: number) => {
    const safeHoursValue = Math.max(0, Number(hoursValue) || 0)
    const totalMinutes = Math.round(safeHoursValue * 60)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60

    if (days > 0) {
      const parts = [`${days}d`]
      if (hours > 0) parts.push(`${hours}h`)
      if (minutes > 0) parts.push(`${minutes}m`)
      return parts.join(' ')
    }

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const roundHours = (hoursValue: number) => {
    if (rounding === 'hour') return Number(hoursValue.toFixed(0))
    if (rounding === 'day') return Number((Math.round(hoursValue / 24) * 24).toFixed(2))
    return Number(hoursValue.toFixed(2))
  }

  const formatDurationSummary = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds))
    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }

    return `${minutes}m`
  }

  const loadTimePageData = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error('Not authenticated')

      const [entriesRes, timersRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('date', { ascending: false }),
        supabase
          .from('active_timers')
          .select('id, company_id, user_id, description, started_at, first_started_at, paused_at, accumulated_seconds, pause_events')
          .eq('user_id', user.id)
          .eq('company_id', currentCompany.id)
          .order('started_at', { ascending: true })
      ])

      if (entriesRes.error) throw entriesRes.error
      if (timersRes.error) {
        const formatted = formatSupabaseError(timersRes.error)
        const missingExtendedTimerColumns =
          formatted.message.toLowerCase().includes('first_started_at') ||
          formatted.message.toLowerCase().includes('pause_events')

        if (!missingExtendedTimerColumns) {
          throw timersRes.error
        }
      }

      const fallbackTimersRes = timersRes.error
        ? await supabase
            .from('active_timers')
            .select('id, company_id, user_id, description, started_at, paused_at, accumulated_seconds')
            .eq('user_id', user.id)
            .eq('company_id', currentCompany.id)
            .order('started_at', { ascending: true })
        : null

      if (fallbackTimersRes?.error) throw fallbackTimersRes.error

      setTimeEntries(
        sortTimeEntries((entriesRes.data ?? []).map((item) => ({ ...item, hours: Number(item.hours) })))
      )
      setActiveTimers(((fallbackTimersRes?.data ?? timersRes.data ?? []) as ActiveTimer[]))
    } catch (error) {
      console.error('Failed to load time data:', formatSupabaseError(error))
      setTimerError('Failed to load time tracking data')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    void loadTimePageData()
  }, [loadTimePageData])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const startNewTimer = async () => {
    if (startingTimer) {
      return
    }

    if (!currentCompany) {
      setTimerError('Create a workspace first')
      return
    }

    if (activeTimers.length >= MAX_ACTIVE_TIMERS) {
      setTimerError(`You can run up to ${MAX_ACTIVE_TIMERS} active timers at the same time. Complete one before starting another.`)
      return
    }

    setStartingTimer(true)
    setTimerError('')
    setTimerInfo('')

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) {
        throw new Error('Not authenticated')
      }

      const { data: existingTimers, error: existingTimerError } = await supabase
        .from('active_timers')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .limit(MAX_ACTIVE_TIMERS + 1)

      if (existingTimerError) throw existingTimerError
      if ((existingTimers?.length ?? 0) >= MAX_ACTIVE_TIMERS) {
        setTimerError(`You can run up to ${MAX_ACTIVE_TIMERS} active timers at the same time. Complete one before starting another.`)
        return
      }

      const startedAt = new Date().toISOString()
      const payload = {
        company_id: currentCompany.id,
        user_id: user.id,
        description: newTimerDescription.trim() || 'Timed session',
        started_at: startedAt,
      }

      const { data, error } = await supabase
        .from('active_timers')
        .insert(payload)
        .select('id, company_id, user_id, description, started_at, paused_at, accumulated_seconds')
        .single()

      if (error) throw error
      if (!data) {
        throw new Error('Active timer start returned no row')
      }

      setActiveTimers((prev) => [...prev, data as ActiveTimer])
      setNewTimerDescription('')
      setTimerInfo('Timer started')
    } catch (error) {
      const formatted = formatSupabaseError(error)
      console.error('Active timer start payload:', {
        company_id: currentCompany.id,
        user_id: 'resolved at runtime',
        description: newTimerDescription.trim() || 'Timed session',
      })
      console.error('Failed to start timer:', formatted)
      if (formatted.code === '23505' && formatted.message.includes('uq_active_timers_user_id')) {
        setTimerError('The database still allows only one active timer. The timer page is ready for up to 7, but the database constraint must also allow it.')
        return
      }
      setTimerError(
        [formatted.message, formatted.details, formatted.hint, formatted.code ? `Code: ${formatted.code}` : '']
          .filter(Boolean)
          .join(' · ')
      )
    } finally {
      setStartingTimer(false)
    }
  }

  const stopTimer = async (timerId: string) => {
    try {
      const { data, error } = await supabase.rpc('pause_active_timer', { p_timer_id: timerId })

      if (error) throw error

      if (data) {
        setActiveTimers((prev) =>
          prev.map((timer) => (timer.id === timerId ? ({ ...timer, ...(data as Partial<ActiveTimer>) }) : timer))
        )
      }

      setTimerInfo('Timer paused.')
      setTimerError('')
    } catch (error) {
      const formatted = formatSupabaseError(error)
      console.error('Failed to stop timer:', formatted)
      setTimerError(
        [formatted.message, formatted.details, formatted.hint, formatted.code ? `Code: ${formatted.code}` : '']
          .filter(Boolean)
          .join(' · ')
      )
    }
  }

  const resumeTimer = async (timerId: string) => {
    try {
      const { data, error } = await supabase.rpc('resume_active_timer', { p_timer_id: timerId })

      if (error) throw error

      if (data) {
        setActiveTimers((prev) =>
          prev.map((timer) => (timer.id === timerId ? ({ ...timer, ...(data as Partial<ActiveTimer>) }) : timer))
        )
      }

      setTimerInfo('Timer resumed.')
      setTimerError('')
    } catch (error) {
      const formatted = formatSupabaseError(error)
      console.error('Failed to resume timer:', formatted)
      setTimerError(
        [formatted.message, formatted.details, formatted.hint, formatted.code ? `Code: ${formatted.code}` : '']
          .filter(Boolean)
          .join(' · ')
      )
    }
  }

  const completeTimer = async (timerId: string) => {
    try {
      const { data: insertedEntry, error: completeError } = await completeActiveTimer(timerId)

      if (completeError) throw completeError

      setActiveTimers((prev) => prev.filter((activeTimer) => activeTimer.id !== timerId))
      if (insertedEntry) {
        setTimeEntries((prev) =>
          sortTimeEntries([{ ...insertedEntry, hours: Number(insertedEntry.hours) } as TimeEntry, ...prev])
        )
      }

      setTimerInfo('Timer completed and saved.')
      setTimerError('')
    } catch (error) {
      const formatted = formatSupabaseError(error)
      console.error('Failed to complete timer:', formatted)
      setTimerError(
        [formatted.message, formatted.details, formatted.hint, formatted.code ? `Code: ${formatted.code}` : '']
          .filter(Boolean)
          .join(' · ')
      )
    }
  }

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentCompany) return

    setImporting(true)
    setTimerError('')
    setTimerInfo('')

    try {
      const text = await file.text()
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length < 2) {
        throw new Error('CSV must contain a header row and at least one data row')
      }

      const header = lines[0].split(',').map((value) => value.trim().toLowerCase().replace(/^"|"$/g, ''))
      const dateIndex = header.indexOf('date')
      const descriptionIndex = header.indexOf('description')
      const hoursIndex = header.indexOf('hours')

      if (dateIndex === -1 || descriptionIndex === -1 || hoursIndex === -1) {
        throw new Error('CSV must include Date, Description, and Hours columns')
      }

      const rows = lines.slice(1)
      const payload = rows.map((line, index) => {
        const columns = line.split(',').map((value) => value.trim().replace(/^"|"$/g, ''))
        const date = columns[dateIndex]
        const description = columns[descriptionIndex]
        const hours = Number(columns[hoursIndex])

        if (!date || Number.isNaN(new Date(date).getTime())) {
          throw new Error(`Row ${index + 2}: invalid date`)
        }

        if (!description) {
          throw new Error(`Row ${index + 2}: description is required`)
        }

        if (!Number.isFinite(hours) || hours <= 0) {
          throw new Error(`Row ${index + 2}: hours must be greater than 0`)
        }

        return {
          company_id: currentCompany.id,
          date,
          description,
          hours: Number(hours.toFixed(2)),
        }
      })

      const { error } = await supabase.from('time_entries').insert(payload)
      if (error) throw error

      setTimerInfo(`Imported ${payload.length} time entr${payload.length === 1 ? 'y' : 'ies'}`)
      await loadTimePageData()
    } catch (error) {
      const formatted = formatSupabaseError(error)
      console.error('Failed to import time CSV:', formatted)
      setTimerError(
        [formatted.message, formatted.details, formatted.hint, formatted.code ? `Code: ${formatted.code}` : '']
          .filter(Boolean)
          .join(' · ')
      )
    } finally {
      setImporting(false)
      event.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentCompany) return

    try {
      const validatedData = timeEntrySchema.parse(formData)
      const totalHours = validatedData.hours + validatedData.minutes / 60

      if (editingEntry) {
        const { error } = await supabase
          .from('time_entries')
          .update({
            description: validatedData.description,
            date: validatedData.date,
            hours: totalHours,
          })
          .eq('id', editingEntry.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error
        setEditingEntry(null)
      } else {
        const { error } = await supabase
          .from('time_entries')
          .insert({
            description: validatedData.description,
            date: validatedData.date,
            hours: totalHours,
            company_id: currentCompany.id,
          })
        if (error) throw error
      }

      setFormData({
        description: '',
        hours: 0,
        minutes: 0,
        date: new Date().toISOString().split('T')[0],
      })
      setShowForm(false)
      await loadTimePageData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  const handleEdit = (entry: TimeEntry) => {
    const parsedHours = Number(entry.hours)
    setEditingEntry(entry)
    setFormData({
      description: entry.description,
      hours: Math.floor(parsedHours),
      minutes: Math.round((parsedHours - Math.floor(parsedHours)) * 60),
      date: entry.date,
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!currentCompany || !confirm('Are you sure you want to delete this time entry?')) return

    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', id).eq('company_id', currentCompany.id)
      if (error) throw error
      await loadTimePageData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  const totalHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours), 0)

  const handleExportCSV = () => {
    if (timeEntries.length === 0) {
      alert('No data to export')
      return
    }

    const headers = ['Date', 'Description', 'Hours']
    const rows = timeEntries.map((entry) => [entry.date, entry.description, entry.hours])
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${value}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `time-entries-${new Date().toISOString().split('T')[0]}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title={t('time.title')} description="Track your work hours" />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('time.title')} description="Track your work hours" />
        <EmptyState
          icon={Building2}
          title="No workspace selected"
          description="Create your first workspace before tracking time."
          action={{ label: 'Go to onboarding', onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('time.title')} description={`Track your work hours for ${currentCompany.name}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportCSV}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importing...' : 'Import CSV'}
            </Button>
            <Button variant="outline" onClick={handleExportCSV} size="sm" disabled={timeEntries.length === 0}>
              Export CSV
            </Button>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            Active timers: {activeTimers.length}/{MAX_ACTIVE_TIMERS}
          </div>
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Active Timers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Timer name</label>
                <input
                  type="text"
                  value={newTimerDescription}
                  onChange={(e) => setNewTimerDescription(e.target.value)}
                  placeholder="Enter timer label"
                  className="w-full rounded-md border px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">Round to</label>
                <AppSelect
                  value={rounding}
                  onChange={(value) => setRounding(value as 'none' | 'hour' | 'day')}
                  options={[
                    { value: 'none', label: 'Exact minutes' },
                    { value: 'hour', label: 'Hours' },
                    { value: 'day', label: 'Days' },
                  ]}
                />
              </div>
            </div>
            <Button onClick={startNewTimer} disabled={startingTimer || activeTimers.length >= MAX_ACTIVE_TIMERS}>
              <Play className="h-4 w-4" /> Start timer
            </Button>
          </div>

          {timerError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {timerError}
            </div>
          )}

          {activeTimers.length >= MAX_ACTIVE_TIMERS && !timerError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You can run up to {MAX_ACTIVE_TIMERS} active timers at the same time. Complete one before starting another.
            </div>
          )}

          {timerInfo && (
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {timerInfo}
            </div>
          )}

          {activeTimers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No active timers. Start one to begin tracking.
            </div>
          ) : (
            <div className="space-y-4">
              {activeTimers.map((timer) => {
                const elapsedSeconds = computeElapsedSeconds(timer)
                const elapsedHours = roundHours(elapsedSeconds / 3600)
                const isPaused = Boolean(timer.paused_at)

                return (
                  <Card key={timer.id}>
                    <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold">{timer.description}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                            {isPaused ? 'Paused' : 'Running'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          Started: {new Date(getFirstStartedAt(timer)).toLocaleString()}
                          {isPaused ? ` · paused since ${new Date(timer.paused_at ?? timer.started_at).toLocaleString()}` : ''}
                        </p>
                        {Array.isArray(timer.pause_events) && timer.pause_events.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-slate-500">
                            {timer.pause_events.map((event, index) => (
                              <p key={`${timer.id}-pause-${index}`}>{formatPauseEvent(event, index)}</p>
                            ))}
                          </div>
                        )}
                        <p className="mt-2 text-2xl font-bold">{formatTimer(elapsedSeconds)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {rounding === 'none' ? formatDurationSummary(elapsedSeconds) : formatHours(elapsedHours)}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {isPaused ? (
                          <Button variant="outline" size="sm" onClick={() => resumeTimer(timer.id)}>
                            <Play className="h-4 w-4" /> Resume
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => stopTimer(timer.id)}>
                            <Pause className="h-4 w-4" /> Stop
                          </Button>
                        )}
                        <Button variant="destructive" size="sm" onClick={() => completeTimer(timer.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Complete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Hours Tracked</p>
            <p className="text-3xl font-bold">{formatHours(totalHours)}</p>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingEntry ? 'Edit Time Entry' : 'Add Time Entry'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-md border px-3 py-2"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Hours</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.hours}
                    onChange={(e) => setFormData({ ...formData, hours: Number(e.target.value) })}
                    className="w-full rounded-md border px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Minutes</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="59"
                    value={formData.minutes}
                    onChange={(e) => setFormData({ ...formData, minutes: Number(e.target.value) })}
                    className="w-full rounded-md border px-3 py-2"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full rounded-md border px-3 py-2"
                  required
                />
              </div>
              <Button type="submit">
                {editingEntry ? 'Save Changes' : 'Save Time Entry'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex justify-end">
        <Button onClick={() => { setShowForm(!showForm); setEditingEntry(null) }}>
          {showForm ? 'Cancel' : 'Add Time Entry'}
        </Button>
      </div>

      {timeEntries.length === 0 ? (
        <EmptyState title="No time entries yet" description="Start a timer or add a manual time entry for this workspace." />
      ) : (
        <div className="space-y-4">
          {timeEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{entry.description}</p>
                  <p className="text-sm text-muted-foreground">{entry.date}</p>
                  {entry.timer_started_at && (
                    <p className="text-xs text-muted-foreground">
                      Started {new Date(entry.timer_started_at).toLocaleString()}
                      {entry.timer_completed_at ? ` · completed ${new Date(entry.timer_completed_at).toLocaleString()}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-semibold">{formatHours(Number(entry.hours))}</p>
                  <Button variant="outline" size="icon" onClick={() => handleEdit(entry)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(entry.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
