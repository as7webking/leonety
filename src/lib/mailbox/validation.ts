import { z } from 'zod'

export const imapInputSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(120).optional().default(''),
  imapHost: z.string().trim().min(4).max(253),
  imapPort: z.literal(993),
  imapSecurity: z.literal('tls'),
  smtpHost: z.string().trim().min(4).max(253),
  smtpPort: z.union([z.literal(465), z.literal(587)]),
  smtpSecurity: z.enum(['tls', 'starttls']),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(512),
}).superRefine((input, context) => {
  const expectedSecurity = input.smtpPort === 465 ? 'tls' : 'starttls'
  if (input.smtpSecurity !== expectedSecurity) {
    context.addIssue({ code: 'custom', path: ['smtpSecurity'], message: 'unsupported_security_configuration' })
  }
})

const fieldErrors: Record<string, string> = {
  companyId: 'invalid_request',
  email: 'invalid_email',
  imapHost: 'invalid_imap_host',
  imapPort: 'invalid_imap_port',
  smtpHost: 'invalid_smtp_host',
  smtpPort: 'invalid_smtp_port',
  imapSecurity: 'unsupported_security_configuration',
  smtpSecurity: 'unsupported_security_configuration',
  displayName: 'invalid_display_name',
  username: 'invalid_username',
  password: 'invalid_password',
}

export function getImapInputError(error: z.ZodError) {
  const issue = error.issues[0]
  const field = String(issue?.path[0] ?? '')
  return { error: fieldErrors[field] ?? 'invalid_request', ...(field ? { field } : {}) }
}
