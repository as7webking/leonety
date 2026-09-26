import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { clearAppNavigationMemory, getAppDataMemory, getAppViewMemory, setAppDataMemory, setAppViewMemory } from './app-navigation-memory.ts'

const providerSource = readFileSync(new URL('../contexts/company-context.tsx', import.meta.url), 'utf8')
const memorySource = readFileSync(new URL('./app-navigation-memory.ts', import.meta.url), 'utf8')

test('dashboard uses the shared authenticated route layout', () => {
  assert.equal(existsSync(new URL('../app/(app)/dashboard/page.tsx', import.meta.url)), true)
  assert.equal(existsSync(new URL('../app/dashboard/layout.tsx', import.meta.url)), false)
  assert.equal(existsSync(new URL('../app/dashboard/page.tsx', import.meta.url)), false)
})

test('workspace loading ignores routine auth refresh events and deduplicates initial requests', () => {
  assert.match(providerSource, /inFlightRef\.current\?\.userId === nextUserId/)
  assert.match(providerSource, /event === 'SIGNED_IN'/)
  assert.match(providerSource, /event === 'SIGNED_OUT'/)
  assert.doesNotMatch(providerSource, /onAuthStateChange\(\(\) => \{\s*void refreshCompanies/)
})

test('navigation memory is process-local and clearable without browser persistence', () => {
  clearAppNavigationMemory()
  setAppDataMemory('workspace:transactions', { count: 3 })
  setAppViewMemory('workspace:transactions-view', { sort: 'date' })
  assert.deepEqual(getAppDataMemory<{ count: number }>('workspace:transactions')?.value, { count: 3 })
  assert.deepEqual(getAppViewMemory<{ sort: string }>('workspace:transactions-view'), { sort: 'date' })
  clearAppNavigationMemory()
  assert.equal(getAppDataMemory('workspace:transactions'), undefined)
  assert.equal(getAppViewMemory('workspace:transactions-view'), undefined)
  assert.doesNotMatch(memorySource, /localStorage|sessionStorage|indexedDB/i)
})
