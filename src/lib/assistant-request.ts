import { z } from 'zod'

export const ASSISTANT_MAX_CONTEXT_MESSAGES = 12
export const ASSISTANT_MAX_USER_MESSAGE_LENGTH = 1800
export const ASSISTANT_MAX_RESPONSE_LENGTH = 6000

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.string().trim().min(1).max(ASSISTANT_MAX_USER_MESSAGE_LENGTH),
})

const assistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().trim().min(1).max(ASSISTANT_MAX_RESPONSE_LENGTH),
})

export const assistantRequestSchema = z.object({
  locale: z.string().optional(),
  pathname: z.string().optional(),
  timeZone: z.string().trim().min(1).max(64).optional(),
  companyId: z.string().uuid().optional().nullable(),
  messages: z.array(z.discriminatedUnion('role', [
    userMessageSchema,
    assistantMessageSchema,
  ])).min(1).max(ASSISTANT_MAX_CONTEXT_MESSAGES),
})

export function normalizeAssistantMessagesForRequest(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  return messages.slice(-ASSISTANT_MAX_CONTEXT_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content.slice(
      0,
      message.role === 'user' ? ASSISTANT_MAX_USER_MESSAGE_LENGTH : ASSISTANT_MAX_RESPONSE_LENGTH
    ),
  }))
}
