import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isNavigationItemActive } from '../components/app-shell/navigation-items.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { calculateAppSelectPosition } from './app-select-position.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { shouldCloseNavigationDrawer, shouldOpenNavigationDrawer } from './mobile-navigation-gesture.ts'

test('keeps parent navigation active for nested routes only', () => {
  assert.equal(isNavigationItemActive('/app/employees', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employees/new', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employees/id/edit', '/app/employees'), true)
  assert.equal(isNavigationItemActive('/app/employee-reports', '/app/employees'), false)
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

test('opens navigation only for a deliberate swipe starting at the left edge', () => {
  assert.equal(shouldOpenNavigationDrawer({ startX: 12, startY: 300, endX: 100, endY: 310 }), true)
  assert.equal(shouldOpenNavigationDrawer({ startX: 80, startY: 300, endX: 180, endY: 305 }), false)
  assert.equal(shouldOpenNavigationDrawer({ startX: 12, startY: 300, endX: 55, endY: 302 }), false)
  assert.equal(shouldOpenNavigationDrawer({ startX: 12, startY: 300, endX: 100, endY: 390 }), false)
})

test('closes navigation for a deliberate reverse swipe without reacting to vertical scrolling', () => {
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 170, endY: 306 }), true)
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 220, endY: 302 }), false)
  assert.equal(shouldCloseNavigationDrawer({ startX: 250, startY: 300, endX: 170, endY: 390 }), false)
})
