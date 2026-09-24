'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, Edit3, LifeBuoy, Plus, RefreshCcw, Send, Trash2, X } from 'lucide-react'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import {
  isRetryingLastUserMessage,
  parseAssistantChatCache,
  serializeAssistantChatCache,
  type AssistantChatMessage as ChatMessage,
  type AssistantChatRole as ChatRole,
  type AssistantChatSession as ChatSession,
} from '@/lib/assistant-chat-storage'
import { buildAssistantChatStorageKey, getAssistantErrorKey } from '@/lib/assistant-context'
import { createClient } from '@/lib/supabase-client'

function makeMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function makeChat(title = 'assistant.newChatTitle'): ChatSession {
  const now = new Date().toISOString()
  return {
    id: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function AiAssistantWidget() {
  const pathname = usePathname()
  const { currentCompany } = useCompany()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [authenticatedUserId, setAuthenticatedUserId] = useState('')
  const [loadedStorageKey, setLoadedStorageKey] = useState('')
  const [open, setOpen] = useState(false)
  const [chats, setChats] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [renamingChatId, setRenamingChatId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const lastUserInputRef = useRef('')
  const storageKey = useMemo(
    () => buildAssistantChatStorageKey(authenticatedUserId, currentCompany?.id ?? null),
    [authenticatedUserId, currentCompany?.id]
  )
  const legacyWorkspaceStorageKey = currentCompany?.id
    ? `leonety-assistant-chats:${currentCompany.id}`
    : null
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0] ?? null
  const messages = activeChat?.messages ?? []
  const chatReady = Boolean(storageKey && loadedStorageKey === storageKey && activeChat)
  useBodyScrollLock(open)

  const suggestedQuestions = useMemo(() => [
    t('assistant.suggestion.expense'),
    t('assistant.suggestion.invoice'),
    t('assistant.suggestion.stock'),
    t('assistant.suggestion.woocommerce'),
  ], [t])

  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthenticatedUserId(data.user?.id ?? '')
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthenticatedUserId(session?.user.id ?? '')
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!storageKey) {
      setChats([])
      setActiveChatId('')
      setLoadedStorageKey('')
      return
    }
    try {
      const stored = window.localStorage.getItem(storageKey)
        ?? (legacyWorkspaceStorageKey ? window.localStorage.getItem(legacyWorkspaceStorageKey) : null)
      const parsed = parseAssistantChatCache(stored)
      if (parsed.length > 0) {
        setChats(parsed)
        setActiveChatId(parsed[0].id)
        setLoadedStorageKey(storageKey)
        return
      }
    } catch {
      // Ignore invalid local chat cache.
    }
    const firstChat = makeChat()
    setChats([firstChat])
    setActiveChatId(firstChat.id)
    setLoadedStorageKey(storageKey)
  }, [legacyWorkspaceStorageKey, storageKey])

  useEffect(() => {
    if (!storageKey || loadedStorageKey !== storageKey || chats.length === 0) return
    try {
      window.localStorage.setItem(storageKey, serializeAssistantChatCache(chats))
    } catch {
      // Keep the active chat usable when browser storage is unavailable or full.
    }
  }, [chats, loadedStorageKey, storageKey])

  const updateActiveChatMessages = (nextMessages: ChatMessage[]) => {
    const now = new Date().toISOString()
    setChats((current) => current.map((chat) => {
      if (chat.id !== activeChatId) return chat
      const firstUserMessage = nextMessages.find((message) => message.role === 'user')?.content.trim()
      return {
        ...chat,
        title: chat.title === 'assistant.newChatTitle' && firstUserMessage ? firstUserMessage.slice(0, 48) : chat.title,
        messages: nextMessages,
        updatedAt: now,
      }
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
  }

  const createNewChat = () => {
    const nextChat = makeChat()
    setChats((current) => [nextChat, ...current].slice(0, 20))
    setActiveChatId(nextChat.id)
    setError('')
    setInput('')
    lastUserInputRef.current = ''
  }

  const deleteChat = (chatId: string) => {
    setChats((current) => {
      const next = current.filter((chat) => chat.id !== chatId)
      if (activeChatId === chatId) {
        const replacement = next[0] ?? makeChat()
        setActiveChatId(replacement.id)
        return next.length > 0 ? next : [replacement]
      }
      return next.length > 0 ? next : [makeChat()]
    })
  }

  const saveChatTitle = () => {
    const title = renameValue.trim()
    if (!renamingChatId || !title) {
      setRenamingChatId('')
      return
    }
    setChats((current) => current.map((chat) => chat.id === renamingChatId ? { ...chat, title, updatedAt: new Date().toISOString() } : chat))
    setRenamingChatId('')
    setRenameValue('')
  }

  const askAssistant = async (text: string, retryExistingMessage = false) => {
    const trimmed = text.trim()
    if (!trimmed || loading || !chatReady) return

    const reuseLastMessage = retryExistingMessage && isRetryingLastUserMessage(messages, trimmed)
    const nextMessages = reuseLastMessage
      ? messages.slice(-12)
      : [...messages, makeMessage('user', trimmed)].slice(-12)
    if (!reuseLastMessage) updateActiveChatMessages(nextMessages)
    setInput('')
    setError('')
    setLoading(true)
    lastUserInputRef.current = trimmed

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          pathname,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          companyId: currentCompany?.id ?? null,
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })
      const payload = await response.json().catch(() => ({})) as { answer?: string; error?: string }

      if (!response.ok || !payload.answer) {
        throw new Error(getAssistantErrorKey(response.status, payload.error))
      }

      updateActiveChatMessages([...nextMessages, makeMessage('assistant', payload.answer ?? '')].slice(-12))
    } catch (requestError) {
      const key = requestError instanceof Error && requestError.message.startsWith('assistant.error.')
        ? requestError.message
        : 'assistant.error.generic'
      setError(t(key))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void askAssistant(input)
  }

  const retry = () => {
    if (!lastUserInputRef.current) return
    void askAssistant(lastUserInputRef.current, true)
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-950/35 print:hidden sm:pointer-events-none sm:bg-transparent">
        <section
          role="dialog"
          aria-modal="true"
          aria-label={t('assistant.title')}
          className="absolute inset-0 flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-white shadow-2xl sm:pointer-events-auto sm:inset-auto sm:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:right-5 sm:h-[min(38rem,calc(100dvh-6rem))] sm:w-[min(calc(100vw-2.5rem),44rem)] sm:rounded-xl sm:border sm:border-slate-200"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold text-slate-950">
                <Bot className="h-4 w-4 text-blue-600" />
                {t('assistant.title')}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t('assistant.description')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)]">
            <aside className="min-h-0 border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
              <Button type="button" variant="outline" size="sm" className="w-full justify-start bg-white" onClick={createNewChat} disabled={!chatReady}>
                <Plus className="h-4 w-4" />
                {t('assistant.newChat')}
              </Button>
              <div className="mt-3 max-h-36 space-y-2 overflow-y-auto md:max-h-[28rem]">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('assistant.recentChats')}</p>
                {chats.map((chat) => (
                  <div key={chat.id} className={`rounded-lg border p-2 ${chat.id === activeChatId ? 'border-blue-200 bg-white' : 'border-transparent hover:bg-white'}`}>
                    {renamingChatId === chat.id ? (
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={saveChatTitle}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveChatTitle()
                          if (event.key === 'Escape') setRenamingChatId('')
                        }}
                        className="w-full rounded border px-2 py-1 text-sm"
                        autoFocus
                      />
                    ) : (
                      <button type="button" onClick={() => setActiveChatId(chat.id)} className="block w-full truncate text-left text-sm font-medium text-slate-700">
                        {chat.title === 'assistant.newChatTitle' ? t('assistant.newChatTitle') : chat.title}
                      </button>
                    )}
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingChatId(chat.id)
                          setRenameValue(chat.title === 'assistant.newChatTitle' ? '' : chat.title)
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('assistant.renameChat')}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteChat(chat.id)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        aria-label={t('assistant.deleteChat')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{t('assistant.empty')}</p>
                    <div className="grid gap-2">
                      {suggestedQuestions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => void askAssistant(question)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg px-3 py-2 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'ml-8 bg-blue-600 text-white'
                        : 'mr-8 bg-slate-100 text-slate-800'
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
                {loading && (
                  <div className="mr-8 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                    {t('assistant.thinking')}
                  </div>
                )}
                {error && (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <p>{error}</p>
                    <Button type="button" variant="outline" size="sm" onClick={retry} disabled={loading || !lastUserInputRef.current}>
                      <RefreshCcw className="h-4 w-4" />
                      {t('assistant.retry')}
                    </Button>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="border-t border-slate-200 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                <label className="sr-only" htmlFor="leonety-assistant-input">{t('assistant.inputLabel')}</label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="leonety-assistant-input"
                    value={input}
                    onChange={(event) => setInput(event.target.value.slice(0, 1200))}
                    rows={2}
                    className="min-h-11 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-base leading-5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm"
                    placeholder={t('assistant.placeholder')}
                    disabled={loading || !chatReady}
                  />
                  <Button type="submit" size="icon" disabled={loading || !chatReady || !input.trim()} aria-label={t('assistant.send')}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">{t('assistant.privacy')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      updateActiveChatMessages([])
                      setError('')
                      lastUserInputRef.current = ''
                    }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('assistant.clear')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
        </div>
      )}

      <Button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] h-12 rounded-xl px-4 shadow-lg print:hidden ${open ? 'hidden sm:inline-flex' : ''}`}
        aria-label={t('assistant.button')}
        title={t('assistant.button')}
      >
        <LifeBuoy className="h-4 w-4" />
        <span>{t('assistant.button')}</span>
      </Button>
    </>
  )
}
