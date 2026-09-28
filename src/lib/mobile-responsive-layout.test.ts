import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const cardSource = read('../components/ui/card.tsx')
const containerSource = read('../components/page-container.tsx')
const selectSource = read('../components/app-select.tsx')
const profileSource = read('../app/(app)/profile/page.tsx')
const employeeFormSource = read('../components/employees/employee-profile-form.tsx')
const notificationSource = read('../app/(app)/settings/notifications/page.tsx')
const shiftSource = read('../app/(app)/shifts/page.tsx')
const assistantSource = read('../components/ai-assistant-widget.tsx')

test('shared authenticated layout primitives can shrink inside narrow viewports', () => {
  assert.match(cardSource, /min-w-0 max-w-full rounded-lg/)
  assert.match(cardSource, /min-w-0 max-w-full p-4 pt-0 sm:p-6/)
  assert.match(containerSource, /box-border w-full min-w-0/)
  assert.match(selectSource, /relative min-w-0 max-w-full/)
  assert.match(selectSource, /w-full min-w-0 max-w-full items-center/)
})

test('profile stacks wide settings rows and protects long identifiers on phones', () => {
  assert.match(profileSource, /grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-2/)
  assert.match(profileSource, /flex min-w-0 flex-col gap-4 border-b py-2 sm:flex-row/)
  assert.match(profileSource, /grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3/)
  assert.match(profileSource, /max-w-full break-all font-mono/)
  assert.match(profileSource, /break-all text-sm text-slate-500">\{managedProfile\.email\}/)
})

test('employee, notification, and shift controls intentionally use one column on phones', () => {
  assert.match(employeeFormSource, /grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2/)
  assert.match(notificationSource, /grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2/)
  assert.match(notificationSource, /flex min-w-0 flex-col gap-2 p-3 text-sm sm:flex-row/)
  assert.match(shiftSource, /grid min-w-0 grid-cols-1 gap-3 rounded-lg/)
})

test('assistant launcher stays within the safe viewport without widening the document', () => {
  assert.match(assistantSource, /right-\[max\(1rem,env\(safe-area-inset-right\)\)\]/)
  assert.match(assistantSource, /min-w-0 max-w-\[calc\(100%-2rem\)\]/)
  assert.match(assistantSource, /<span className="min-w-0 truncate">/)
  assert.doesNotMatch(assistantSource, /100vw/)
})

