import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { planDefinitions } from './billing/plans.ts'

test('uses the audited workspace limits for every plan', () => {
  assert.equal(planDefinitions.free.workspaceLimit, 1)
  assert.equal(planDefinitions.starter.workspaceLimit, 2)
  assert.equal(planDefinitions.pro.workspaceLimit, null)
  assert.equal(planDefinitions.business.workspaceLimit, null)
})

test('keeps the existing seven-day paid trial configuration', () => {
  assert.equal(planDefinitions.free.trialDays, 0)
  assert.equal(planDefinitions.starter.trialDays, 7)
  assert.equal(planDefinitions.pro.trialDays, 7)
  assert.equal(planDefinitions.business.trialDays, 7)
})
