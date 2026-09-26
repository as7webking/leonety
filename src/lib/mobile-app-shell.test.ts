import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const drawerSource = readFileSync(new URL('../components/app-shell/mobile-drawer-client.tsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../components/app-shell/app-navigation-shell.tsx', import.meta.url), 'utf8')
const loginSource = readFileSync(new URL('../app/(auth)/login/page.tsx', import.meta.url), 'utf8')
const assistantSource = readFileSync(new URL('../components/ai-assistant-widget.tsx', import.meta.url), 'utf8')

test('keeps closed mobile navigation out of the layout and avoids a left-edge gesture target', () => {
  assert.match(drawerSource, /\{open && <div className="fixed inset-0/)
  assert.doesNotMatch(drawerSource, /shouldOpenNavigationDrawer/)
  assert.doesNotMatch(drawerSource, /w-6 touch-pan-y/)
})

test('constrains the authenticated shell and fixed assistant to the viewport', () => {
  assert.match(shellSource, /data-app-shell/)
  assert.match(shellSource, /w-full min-w-0 max-w-full overflow-x-clip/)
  assert.doesNotMatch(assistantSource, /100vw/)
  assert.match(assistantSource, /right-\[max\(1rem,env\(safe-area-inset-right\)\)\]/)
})

test('replaces login history after password and OAuth authentication', () => {
  assert.match(loginSource, /router\.replace\(nextPath\)/)
  assert.match(loginSource, /skipBrowserRedirect: true/)
  assert.match(loginSource, /window\.location\.replace\(data\.url\)/)
})
