export type AssistantChatRole = 'user' | 'assistant'

export interface AssistantChatMessage {
  id: string
  role: AssistantChatRole
  content: string
  createdAt: string
}

export interface AssistantChatSession {
  id: string
  title: string
  messages: AssistantChatMessage[]
  createdAt: string
  updatedAt: string
}

const MAX_STORED_CHATS = 20
const MAX_STORED_MESSAGES = 12

function isStoredMessage(value: unknown): value is AssistantChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<AssistantChatMessage>
  return typeof message.id === 'string'
    && (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && typeof message.createdAt === 'string'
}

function isStoredChat(value: unknown): value is AssistantChatSession {
  if (!value || typeof value !== 'object') return false
  const chat = value as Partial<AssistantChatSession>
  return typeof chat.id === 'string'
    && typeof chat.title === 'string'
    && Array.isArray(chat.messages)
    && chat.messages.every(isStoredMessage)
    && typeof chat.createdAt === 'string'
    && typeof chat.updatedAt === 'string'
}

export function parseAssistantChatCache(raw: string | null) {
  if (!raw) return []

  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter(isStoredChat)
      .slice(0, MAX_STORED_CHATS)
      .map((chat) => ({
        ...chat,
        messages: chat.messages.slice(-MAX_STORED_MESSAGES),
      }))
  } catch {
    return []
  }
}

export function serializeAssistantChatCache(chats: AssistantChatSession[]) {
  return JSON.stringify(chats.slice(0, MAX_STORED_CHATS).map((chat) => ({
    ...chat,
    messages: chat.messages.slice(-MAX_STORED_MESSAGES),
  })))
}

export function isRetryingLastUserMessage(messages: AssistantChatMessage[], text: string) {
  const lastMessage = messages.at(-1)
  return lastMessage?.role === 'user' && lastMessage.content === text.trim()
}
