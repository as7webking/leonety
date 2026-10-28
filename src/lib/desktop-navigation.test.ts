import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { flatNavigationItems, getActiveNavigationHref, isNavigationItemActive } from '../components/app-shell/navigation-items.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { calculateAppSelectPosition } from './app-select-position.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { shouldCloseNavigationDrawer } from './mobile-navigation-gesture.ts'

test('keeps parent navigation active for nested routes only', () => {
  assert.equal(isNavigationItemActive('/app/employees', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employees/new', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employees/id/edit', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employee-reports', '/app/employees'), false)
})

test('selects exactly one deepest matching item for representative application routes', () => {
  const cases = [
    ['/app/settings', '/app/settings'],
    ['/app/settings/legal', '/app/settings'],
    ['/app/notifications', '/app/notifications'],
    ['/app/mail/messages/provider-id', '/app/mail'],
    ['/app/products/123/edit', '/app/products'],
    ['/app/products/categories', '/app/products'],
    ['/app/inventory', '/app/inventory'],
  ] as const

  for (const [pathname, expected] of cases) {
    assert.equal(getActiveNavigationHref(pathname), expected, pathname)
    assert.equal(flatNavigationItems.filter((item) => isNavigationItemActive(pathname, item.href)).length, 1, pathname)
  }
})

test('desktop and mobile navigation share exclusive active styling with distinct hover/focus states', () => {
  const desktop = readFileSync(new URL('../components/app-shell/desktop-navigation-link.tsx', import.meta.url), 'utf8')
  const mobile = readFileSync(new URL('../components/app-shell/mobile-drawer-client.tsx', import.meta.url), 'utf8')
  const sidebar = readFileSync(new URL('../components/app-shell/app-sidebar.tsx', import.meta.url), 'utf8')

  assert.match(sidebar, /getActiveNavigationHref\(pathname, items\)/)
  assert.match(desktop, /activeHref === href/)
  assert.match(desktop, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(desktop, /bg-blue-50 text-blue-700[\s\S]*text-slate-700 hover:bg-slate-100/)
  assert.match(desktop, /focus-visible:ring-slate-900/)
  assert.match(mobile, /getActiveNavigationHref\(pathname, navigationItems\)/)
  assert.equal((mobile.match(/aria-current=\{activeHref === item\.href \? 'page' : undefined\}/g) ?? []).length, 2)
  assert.match(mobile, /bg-blue-50 text-blue-700[\s\S]*text-slate-700 hover:bg-slate-100/)
  assert.match(mobile, /focus-visible:ring-slate-900/)
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto/)
  assert.match(sidebar, /pb-\[calc\(var\(--app-footer-content-height\)\+env\(safe-area-inset-bottom\)\)\]/)
})

test('places a dropdown directly below its trigger when space is available', () => {
  const position = calculateAppSelectPosition({
    rect: { top: 100, bottom: 140, left: 200, width: 240 },
    viewportWidth: 1440,
    viewportHeight: 900,
    optionCount: 5,
    placement: 'auto',
  })
  assert.equal(position.openAbove, false)
  assert.equal(position.top, 146)
  assert.equal(position.bottom, undefined)
})

test('keeps a middle-viewport dropdown below when both sides fit', () => {
  const position = calculateAppSelectPosition({
    rect: { top: 380, bottom: 420, left: 560, width: 280 },
    viewportWidth: 1366,
    viewportHeight: 900,
    optionCount: 6,
    placement: 'auto',
  })
  assert.equal(position.openAbove, false)
  assert.equal(position.top, 426)
})

test('bottom-anchors an upward dropdown without a synthetic empty gap', () => {
  const position = calculateAppSelectPosition({
    rect: { top: 810, bottom: 850, left: 200, width: 240 },
    viewportWidth: 1440,
    viewportHeight: 900,
    optionCount: 2,
    placement: 'auto',
  })
  assert.equal(position.openAbove, true)
  assert.equal(position.top, undefined)
  assert.equal(position.bottom, 96)
  assert.equal(position.maxHeight, 288)
})

test('honors an upward preference while falling back when the top cannot fit', () => {
  const nearTop = calculateAppSelectPosition({
    rect: { top: 36, bottom: 76, left: 24, width: 240 },
    viewportWidth: 1280,
    viewportHeight: 720,
    optionCount: 5,
    placement: 'top',
  })
  assert.equal(nearTop.openAbove, false)

  const nearBottom = calculateAppSelectPosition({
    rect: { top: 640, bottom: 680, left: 24, width: 240 },
    viewportWidth: 1920,
    viewportHeight: 720,
    optionCount: 5,
    placement: 'top',
  })
  assert.equal(nearBottom.openAbove, true)
  assert.equal(nearBottom.bottom, 86)
})

test('closes navigation for a deliberate reverse swipe without reacting to vertical scrolling', () => {
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 170, endY: 306 }), true)
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 220, endY: 302 }), false)
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 170, endY: 390 }), false)
})
