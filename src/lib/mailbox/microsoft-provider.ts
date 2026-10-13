import 'server-only'

import type { MailboxMessage, MailboxMessageSummary, MailboxPage, MailboxProvider, MailboxSendInput, MailboxFolder, MailboxFilter } from './types'
import { simpleParser } from 'mailparser'
import { MailboxProviderError } from './types'
import { readMailboxJson } from './http'

const GRAPH = 'https://graph.microsoft.com/v1.0'

async function graph<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('https://') ? new URL(path) : new URL(path, GRAPH)
  if (url.origin !== GRAPH) throw new MailboxProviderError('provider_error')
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (response.status === 401 || response.status === 403) throw new MailboxProviderError('reconnect_required')
  if (response.status === 429) throw new MailboxProviderError('rate_limited')
  if (response.status >= 500) throw new MailboxProviderError('provider_unavailable')
  if (!response.ok) throw new MailboxProviderError('provider_error')
  if (response.status === 202 || response.status === 204) return undefined as T
  return readMailboxJson<T>(response)
}

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  receivedDateTime?: string
  isRead?: boolean
  hasAttachments?: boolean
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: Array<{ emailAddress?: { address?: string } }>
  body?: { contentType?: string; content?: string }
  internetMessageId?: string
  internetMessageHeaders?: Array<{ name: string; value: string }>
}

export class MicrosoftMailboxProvider implements MailboxProvider {
  readonly provider = 'microsoft' as const
  constructor(private readonly token: string, private readonly accountEmail: string, private readonly connectionId: string) {}

  async testConnection() {
    await graph(this.token, '/me?$select=id,mail,userPrincipalName')
  }

  async listMessages(folder: MailboxFolder, cursor?: string | null, limit = 20, filter: MailboxFilter = 'all'): Promise<MailboxPage> {
    const endpoint = folder === 'inbox' ? 'inbox' : 'sentitems'
    const params = new URLSearchParams({
      '$select': 'id,conversationId,subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,hasAttachments',
      '$orderby': 'receivedDateTime desc',
      '$top': String(Math.min(Math.max(limit, 1), 30)),
    })
    if (filter === 'unread' && folder === 'inbox') params.set('$filter', 'isRead eq false')
    const path = cursor || `/me/mailFolders/${endpoint}/messages?${params}`
    const page = await graph<{ value?: GraphMessage[]; '@odata.nextLink'?: string }>(this.token, path)
    const messages = (page.value ?? []).map((message): MailboxMessageSummary => ({
      id: message.id,
      providerMessageId: message.id,
      provider: this.provider,
      connectionId: this.connectionId,
      threadId: message.conversationId ?? null,
      mailboxId: this.connectionId,
      mailboxEmail: this.accountEmail,
      folder,
      from: {
        name: message.from?.emailAddress?.name ?? null,
        email: message.from?.emailAddress?.address ?? '',
      },
      to: message.toRecipients?.map((recipient) => recipient.emailAddress?.address ?? '').filter(Boolean) ?? [],
      subject: message.subject ?? '',
      snippet: message.bodyPreview ?? '',
      receivedAt: message.receivedDateTime ?? null,
      isRead: message.isRead ?? false,
      hasAttachments: message.hasAttachments ?? false,
    }))
    return { messages, nextCursor: page['@odata.nextLink'] ?? null }
  }

  async getMessage(folder: MailboxFolder, id: string): Promise<MailboxMessage> {
    const message = await graph<GraphMessage>(this.token, `/me/messages/${encodeURIComponent(id)}?$select=id,conversationId,subject,from,toRecipients,body,bodyPreview,receivedDateTime,isRead,hasAttachments,internetMessageId,internetMessageHeaders`)
    const from = message.from?.emailAddress
    const references = message.internetMessageHeaders
      ?.filter((header) => ['references', 'in-reply-to'].includes(header.name.toLowerCase()))
      .flatMap((header) => header.value.split(/\s+/).filter(Boolean)) ?? []
    return {
      id: message.id,
      providerMessageId: message.id,
      provider: this.provider,
      connectionId: this.connectionId,
      threadId: message.conversationId ?? null,
      mailboxId: this.connectionId,
      mailboxEmail: this.accountEmail,
      folder,
      from: { name: from?.name ?? null, email: from?.address ?? '' },
      to: message.toRecipients?.map((recipient) => recipient.emailAddress?.address ?? '').filter(Boolean) ?? [],
      subject: message.subject ?? '',
      snippet: message.bodyPreview ?? '',
      receivedAt: message.receivedDateTime ?? null,
      isRead: message.isRead ?? false,
      hasAttachments: message.hasAttachments ?? false,
      textBody: (message.body?.contentType?.toLowerCase() === 'text' ? message.body.content ?? '' : await htmlToText(message.body?.content ?? '')).slice(0, 100_000),
      replyTo: message.internetMessageId ?? null,
      references,
    }
  }

  async setRead(_folder: MailboxFolder, id: string, read: boolean) {
    await graph(this.token, `/me/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isRead: read }),
    })
  }

  async sendMessage(input: MailboxSendInput) {
    await graph(this.token, '/me/sendMail', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: cleanHeader(input.subject),
          body: { contentType: 'Text', content: input.text },
          toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    })
  }

  async reply(input: MailboxSendInput) {
    if (!input.replyToMessageId) throw new MailboxProviderError('invalid_message')
    const draft = await graph<{ id: string }>(this.token, `/me/messages/${encodeURIComponent(input.replyToMessageId)}/createReply`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    })
    await graph(this.token, `/me/messages/${encodeURIComponent(draft.id)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: cleanHeader(input.subject),
        body: { contentType: 'Text', content: input.text },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
      }),
    })
    await graph(this.token, `/me/messages/${encodeURIComponent(draft.id)}/send`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
    })
  }

  async disconnect() {
    // Microsoft OAuth refresh tokens are revoked by removing the user grant in Entra.
    // No undocumented token-revocation endpoint is called here.
  }
}

async function htmlToText(html: string) {
  const parsed = await simpleParser(`Content-Type: text/html; charset=UTF-8\r\n\r\n${html}`)
  return parsed.text ?? ''
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
