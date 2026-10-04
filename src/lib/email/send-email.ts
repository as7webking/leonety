import 'server-only'

import { getEmailRuntimeConfig } from './config'
import { sendWithResend } from './providers/resend'
import type { EmailMessage, EmailSendResult } from './types'

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const runtime = getEmailRuntimeConfig()
  if (!runtime.ok) return runtime

  return sendWithResend(message, runtime.config)
}
