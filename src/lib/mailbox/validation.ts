import { z } from 'zod'

export const imapInputSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(120).optional().default(''),
  imapHost: z.string().trim().min(4).max(253),
  imapPort: z.literal(993),
  smtpHost: z.string().trim().min(4).max(253),
  smtpPort: z.union([z.literal(465), z.literal(587)]),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(512),
})
