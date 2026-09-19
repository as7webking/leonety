import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getEmployeeDocumentStatus, sanitizeEmployeeDocumentFilename } from './employee-documents.ts'

test('derives missing, uploaded, expiring and expired document states', () => {
  const now = new Date('2026-09-19T12:00:00Z')
  assert.equal(getEmployeeDocumentStatus(null, now), 'missing')
  assert.equal(getEmployeeDocumentStatus({ expiration_date: null }, now), 'uploaded')
  assert.equal(getEmployeeDocumentStatus({ expiration_date: '2026-09-10' }, now), 'expired')
  assert.equal(getEmployeeDocumentStatus({ expiration_date: '2026-10-01' }, now), 'expiring_soon')
  assert.equal(getEmployeeDocumentStatus({ expiration_date: '2027-01-01' }, now), 'uploaded')
})

test('sanitizes uploaded file names without changing their extension', () => {
  assert.equal(sanitizeEmployeeDocumentFilename('My ID (front).pdf'), 'My-ID-front-.pdf')
  assert.equal(sanitizeEmployeeDocumentFilename('../../'), 'document')
})
