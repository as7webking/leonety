import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('employee schedule print is a separate fixed A4 document without viewport sizing', async () => {
  const [css, component] = await Promise.all([
    readFile(new URL('components/schedules/employee-schedule-print.module.css', root), 'utf8'),
    readFile(new URL('components/schedules/employee-schedule-print.tsx', root), 'utf8'),
  ])

  assert.match(css, /size:\s*A4 portrait/)
  assert.match(css, /185\.5mm/)
  assert.doesNotMatch(css, /100(?:d|s|l)?vh/)
  assert.match(css, /data-final-page='true'[\s\S]*break-after:\s*auto/)
  assert.doesNotMatch(component.toLowerCase(), /kassenbuch/)
})

test('employee schedule print includes the required schedule columns and totals', async () => {
  const component = await readFile(new URL('components/schedules/employee-schedule-print.tsx', root), 'utf8')
  for (const key of ['schedule.personalNumber', 'shifts.location', 'schedule.duration', 'schedule.weeklyTotal']) {
    assert.match(component, new RegExp(key.replace('.', '\\.')))
  }
})
