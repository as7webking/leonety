import 'server-only'

import { simpleParser } from 'mailparser'
import type { MailboxMessage, MailboxMessageSummary, MailboxPage, MailboxProvider, MailboxSendInput, MailboxFolder, MailboxFilter } from './types'
import { MailboxProviderError } from './types'
import { readMailboxJson } from './http'
import { classifyGoogleApiFailure } from './google-errors'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function request<T>(token: string, path: string, init?: RequestInit, missingAsNotFound = false): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  })
  if (response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500) {
    const payload = response.status === 403 ? await response.clone().json().catch(() => null) : null
    throw new MailboxProviderError(classifyGoogleApiFailure(response.status, payload))
  }
  if (response.status === 404 && missingAsNotFound) throw new MailboxProviderError('message_not_found')
  if (!response.ok) throw new MailboxProviderError('provider_error')
  return readMailboxJson<T>(response)
}

function header(headers: Array<{ name: string; value: string }> = [], name: string) {
  return headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parseAddress(value: string) {
  const parsed = value.match(/^(.*?)\s*<([^<>]+)>$/)
  return parsed
    ? { name: parsed[1].replace(/^"|"$/g, '').trim() || null, email: parsed[2].trim() }
    : { name: null, email: value.trim() }
}

export class GoogleMailboxProvider implements MailboxProvider {
  readonly provider = 'google' as const
  constructor(private readonly token: string, private readonly accountEmail: string, private readonly connectionId: string) {}

  async testConnection() {
    await request(this.token, '/profile')
  }

  async listMessages(folder: MailboxFolder, cursor?: string | null, limit = 20, filter: MailboxFilter = 'all'): Promise<MailboxPage> {
    const params = new URLSearchParams({ maxResults: String(Math.min(Math.max(limit, 1), 30)) })
    params.append('labelIds', folder === 'inbox' ? 'INBOX' : 'SENT')
    if (filter === 'unread') params.append('labelIds', 'UNREAD')
    if (cursor) params.set('pageToken', cursor)
    const page = await request<{ messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string }>(this.token, `/messages?${params}`)
    const messages: MailboxMessageSummary[] = []
    const entries = page.messages ?? []
    for (let offset = 0; offset < entries.length; offset += 5) {
      const chunk = await Promise.all(entries.slice(offset, offset + 5).map(async (entry) => {
        const detail = await request<{
          id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[];
          payload?: { headers?: Array<{ name: string; value: string }>; parts?: unknown[] }
        }>(this.token, `/messages/${encodeURIComponent(entry.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
        const headers = detail.payload?.headers ?? []
        return {
          id: detail.id,
          providerMessageId: detail.id,
          provider: this.provider,
          connectionId: this.connectionId,
          threadId: detail.threadId,
          mailboxId: this.connectionId,
          mailboxEmail: this.accountEmail,
          folder,
          from: parseAddress(header(headers, 'From')),
          to: header(headers, 'To').split(',').map((value) => value.trim()).filter(Boolean),
          subject: header(headers, 'Subject'),
          snippet: detail.snippet ?? '',
          receivedAt: detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : null,
          isRead: !(detail.labelIds ?? []).includes('UNREAD'),
          hasAttachments: JSON.stringify(detail.payload?.parts ?? []).includes('attachmentId'),
        } satisfies MailboxMessageSummary
      }))
      messages.push(...chunk)
    }
    return { messages, nextCursor: page.nextPageToken ?? null }
  }

  async getMessage(folder: MailboxFolder, id: string): Promise<MailboxMessage> {
    const message = await request<{
      id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[];
      payload?: GmailPart
    }>(this.token, `/messages/${encodeURIComponent(id)}?format=full`, undefined, true)
    const headers = message.payload?.headers ?? []
    const text = await extractText(message.payload)
    const base = {
      id: message.id,
      providerMessageId: message.id,
      provider: this.provider,
      connectionId: this.connectionId,
      threadId: message.threadId,
      mailboxId: this.connectionId,
      mailboxEmail: this.accountEmail,
      folder,
      from: parseAddress(header(headers, 'From')),
      to: header(headers, 'To').split(',').map((value) => value.trim()).filter(Boolean),
      subject: header(headers, 'Subject'),
      snippet: message.snippet ?? '',
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null,
      isRead: !(message.labelIds ?? []).includes('UNREAD'),
      hasAttachments: hasAttachments(message.payload),
      textBody: text.slice(0, 100_000),
      replyTo: header(headers, 'Message-ID') || null,
      references: header(headers, 'References').split(/\s+/).filter(Boolean),
    }
    return base
  }

  async setRead(_folder: MailboxFolder, id: string, read: boolean) {
    await request(this.token, `/messages/${encodeURIComponent(id)}/modify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }),
    })
  }

  async sendMessage(input: MailboxSendInput) {
    await this.sendMime(input)
  }

  async reply(input: MailboxSendInput) {
    if (!input.replyToMessageId) throw new MailboxProviderError('invalid_message')
    const original = await this.getMessage('inbox', input.replyToMessageId)
    await this.sendMime({
      ...input,
      to: input.to.length ? input.to : [original.from.email],
      subject: input.subject || (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`),
    }, original)
  }

  private async sendMime(input: MailboxSendInput, replyTo?: MailboxMessage) {
    const subject = cleanHeader(input.subject)
    const headers = [
      `To: ${input.to.map(cleanHeader).join(', ')}`,
      ...(input.cc?.length ? [`Cc: ${input.cc.map(cleanHeader).join(', ')}`] : []),
      `Subject: ${/^[\x00-\x7F]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      ...(replyTo?.replyTo ? [`In-Reply-To: ${cleanHeader(replyTo.replyTo)}`] : []),
      ...(replyTo?.references.length ? [`References: ${replyTo.references.map(cleanHeader).join(' ')}`] : []),
      '',
      Buffer.from(input.text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim(),
    ]
    await request(this.token, '/messages/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(headers.join('\r\n')).toString('base64url'), ...(replyTo?.threadId ? { threadId: replyTo.threadId } : {}) }),
    })
  }

  async disconnect() {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(this.token)}`, {
      method: 'POST', signal: AbortSignal.timeout(8_000), cache: 'no-store',
    }).catch(() => undefined)
  }
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPart[]
}

function hasAttachments(part?: GmailPart): boolean {
  if (!part) return false
  return Boolean(part.filename || part.body?.attachmentId || part.parts?.some(hasAttachments))
}

async function extractText(part?: GmailPart): Promise<string> {
  if (!part) return ''
  const queue = [part]
  const candidates: GmailPart[] = []
  let visited = 0
  while (queue.length && visited < 1000) {
    const current = queue.shift()!
    visited++
    if (current.filename || current.body?.attachmentId) continue
    if (current.body?.data && (current.mimeType === 'text/plain' || current.mimeType === 'text/html')) candidates.push(current)
    queue.push(...(current.parts ?? []))
  }
  const selected = candidates.find((candidate) => candidate.mimeType === 'text/plain')
    ?? candidates.find((candidate) => candidate.mimeType === 'text/html')
  const data = selected?.body?.data
  if (!data || data.length > 2_400_000) return ''
  const content = Buffer.from(data, 'base64url')
  if (selected?.mimeType === 'text/html') {
    const parsed = await simpleParser(`Content-Type: text/html; charset=UTF-8\r\n\r\n${content.toString('utf8')}`)
    return parsed.text ?? ''
  }
  return content.toString('utf8')
}
