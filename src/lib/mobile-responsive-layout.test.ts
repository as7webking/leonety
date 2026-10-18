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
const mailSource = read('../components/mail/mail-client.tsx')
const productCreateSource = read('../app/(app)/products/new/page.tsx')
const productEditSource = read('../app/(app)/products/[productId]/edit/page.tsx')
const contractSource = read('../app/(app)/contracts/page.tsx')
const timeSource = read('../app/(app)/time/page.tsx')
const layoutSource = read('../app/layout.tsx')
const globalCss = read('../app/globals.css')
const installerSource = read('../components/pwa-installer.tsx')
const manifestSource = read('../../public/manifest.json')

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

test('enables safe-area insets and keeps the PWA installer clear of device edges', () => {
  assert.match(layoutSource, /viewportFit:\s*["']cover["']/)
  assert.match(globalCss, /padding-left:\s*env\(safe-area-inset-left,\s*0px\)/)
  assert.match(globalCss, /padding-right:\s*env\(safe-area-inset-right,\s*0px\)/)
  assert.doesNotMatch(globalCss, /padding-(?:left|right|bottom):\s*safe-area-inset-/)
  assert.match(installerSource, /bottom-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/)
  assert.match(installerSource, /left-\[max\(1rem,env\(safe-area-inset-left\)\)\]/)
})

test('installed PWA does not force portrait orientation on tablets', () => {
  const manifest = JSON.parse(manifestSource) as { orientation?: string }
  assert.equal(manifest.orientation, 'any')
})

test('mobile mail compose respects safe areas and the dynamic viewport', () => {
  assert.match(mailSource, /pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/)
  assert.match(mailSource, /pt-\[max\(0\.5rem,env\(safe-area-inset-top\)\)\]/)
  assert.match(mailSource, /max-h-\[calc\(94dvh-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)\)\]/)
})

test('sticky mobile form actions reserve the home-indicator safe area', () => {
  for (const source of [productCreateSource, productEditSource, contractSource]) {
    assert.match(source, /pb-\[calc\([^\]]*env\(safe-area-inset-bottom\)[^\]]*\)\]/)
  }
})

test('time entry numeric fields stack on phone-sized screens', () => {
  assert.match(timeSource, /grid grid-cols-1 gap-4 sm:grid-cols-2/)
})

