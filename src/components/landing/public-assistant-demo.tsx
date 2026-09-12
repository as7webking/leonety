'use client'

import { FormEvent, useState } from 'react'
import { Bot, Loader2, Send } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'

type Message = { role: 'user' | 'assistant'; content: string }

function errorKey(status: number, code?: string) {
  if (status === 429 || code === 'rate_limited') return 'landing.assistant.errorRateLimit'
  if (status === 503 || code === 'provider_unavailable') return 'landing.assistant.unavailable'
  if (status === 400 || code === 'invalid_request') return 'landing.assistant.errorInvalid'
  return 'landing.assistant.errorGeneric'
}

export function PublicAssistantDemo() {
  const { locale, t } = useI18n()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const suggestions = [
    'landing.assistant.questionInvoice',
    'landing.assistant.questionStock',
    'landing.assistant.questionWoo',
    'landing.assistant.questionExpense',
    'landing.assistant.questionContract',
  ]

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault()
    const question = (suggested ?? input).trim()
    if (!question || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: question }].slice(-5)
    setMessages(nextMessages)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/public-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, messages: nextMessages }),
      })
      const payload = await response.json().catch(() => ({})) as { answer?: string; error?: string }
      if (!response.ok || !payload.answer) {
        setError(t(errorKey(response.status, payload.error)))
        return
      }
      setMessages((current) => [...current, { role: 'assistant' as const, content: payload.answer as string }].slice(-6))
    } catch {
      setError(t('landing.assistant.errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 text-white"><Bot className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-950">{t('landing.assistant.title')}</h3>
          <p className="truncate text-sm text-slate-500">{t('landing.assistant.publicOnly')}</p>
        </div>
      </div>

      <div className="min-h-64 space-y-3 bg-slate-50 p-4 sm:p-5" aria-live="polite">
        {messages.length === 0 ? (
          <div>
            <p className="text-sm leading-6 text-slate-600">{t('landing.assistant.intro')}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {suggestions.map((key) => (
                <button key={key} type="button" className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" onClick={() => void submit(undefined, t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200'}`}>
            {message.content}
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t('landing.assistant.thinking')}</div>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      </div>

      <form className="flex items-end gap-2 border-t border-slate-200 p-3 sm:p-4" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="public-assistant-message">{t('landing.assistant.inputLabel')}</label>
        <textarea id="public-assistant-message" value={input} onChange={(event) => setInput(event.target.value.slice(0, 600))} rows={2} maxLength={600} placeholder={t('landing.assistant.placeholder')} className="min-h-12 min-w-0 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <button type="submit" disabled={loading || !input.trim()} className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t('landing.assistant.send')}>
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
