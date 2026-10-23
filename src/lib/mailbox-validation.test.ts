import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getImapInputError, imapInputSchema } from './mailbox/validation.ts'

const base = {
  companyId: '00000000-0000-4000-8000-000000000001', email: 'mail@example.com', displayName: '',
  imapHost: 'imap.example.com', imapPort: 993, smtpHost: 'smtp.example.com', smtpPort: 465,
  imapSecurity: 'tls', smtpSecurity: 'tls', username: 'mail@example.com', password: 'not-logged',
}

test('IMAP setup validation returns safe field-specific failures', () => {
  const email = imapInputSchema.safeParse({ ...base, email: 'not-an-email' })
  assert.equal(email.success, false)
  if (!email.success) assert.deepEqual(getImapInputError(email.error), { error: 'invalid_email', field: 'email' })

  const host = imapInputSchema.safeParse({ ...base, imapHost: 'x' })
  assert.equal(host.success, false)
  if (!host.success) assert.deepEqual(getImapInputError(host.error), { error: 'invalid_imap_host', field: 'imapHost' })

  const port = imapInputSchema.safeParse({ ...base, smtpPort: 25 })
  assert.equal(port.success, false)
  if (!port.success) assert.deepEqual(getImapInputError(port.error), { error: 'invalid_smtp_port', field: 'smtpPort' })

  const securityMismatch = imapInputSchema.safeParse({ ...base, smtpPort: 587 })
  assert.equal(securityMismatch.success, false)
  if (!securityMismatch.success) assert.deepEqual(getImapInputError(securityMismatch.error), { error: 'unsupported_security_configuration', field: 'smtpSecurity' })

  const startTls = imapInputSchema.safeParse({ ...base, smtpPort: 587, smtpSecurity: 'starttls' })
  assert.equal(startTls.success, true)
})

test('password is never included in field validation diagnostics', () => {
  const invalid = imapInputSchema.safeParse({ ...base, password: '' })
  assert.equal(invalid.success, false)
  if (!invalid.success) assert.doesNotMatch(JSON.stringify(getImapInputError(invalid.error)), /not-logged/)
})
