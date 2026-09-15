import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { applyIncomeTitleToSelection, bulkIncomeTitleRequestSchema } from './income-bulk-title.ts'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'

test('updates exactly the selected income titles', () => {
  const original = [
    { id: firstId, title: 'Original A', description: 'A' },
    { id: secondId, title: 'Original B', description: 'B' },
  ]

  const updated = applyIncomeTitleToSelection(original, [secondId], 'Updated')

  assert.strictEqual(updated[0], original[0])
  assert.deepEqual(updated[0], { id: firstId, title: 'Original A', description: 'A' })
  assert.deepEqual(updated[1], { id: secondId, title: 'Updated', description: 'B' })
})

test('validates workspace, unique selected IDs and a non-empty title', () => {
  assert.equal(bulkIncomeTitleRequestSchema.safeParse({
    companyId: firstId,
    incomeIds: [secondId],
    title: '  Website payment  ',
  }).success, true)

  assert.equal(bulkIncomeTitleRequestSchema.safeParse({
    companyId: firstId,
    incomeIds: [secondId, secondId],
    title: 'Duplicate IDs',
  }).success, false)

  assert.equal(bulkIncomeTitleRequestSchema.safeParse({
    companyId: firstId,
    incomeIds: [secondId],
    title: '   ',
  }).success, false)

  assert.equal(bulkIncomeTitleRequestSchema.safeParse({
    companyId: firstId,
    incomeIds: Array.from({ length: 101 }, (_, index) => `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`),
    title: 'Too many rows',
  }).success, false)
})
