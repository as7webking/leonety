import 'server-only'

import dns from 'node:dns/promises'
import net from 'node:net'
import { domainToASCII } from 'node:url'
import nodemailer, { type Transporter } from 'nodemailer'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { MailboxConnectionRecord, MailboxFolder, MailboxFilter, MailboxMessage, MailboxMessageSummary, MailboxPage, MailboxProvider, MailboxSendInput } from './types'
import { MailboxProviderError } from './types'
import { decryptMailboxConfig } from './server'
import { isMailboxRelatedHost } from './host-scope'

interface ImapSmtpConfig {
  address: string
  displayName?: string
  imapHost: string
  imapPort: 993
  smtpHost: string
  smtpPort: 465 | 587
  username: string
  password: string
}

const CONNECT_TIMEOUT_MS = 10_000
const OPERATION_TIMEOUT_MS = 15_000
const PAGE_SIZE = 20

function publicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168)) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  if (a === 255) return false
  return true
}

async function resolvePublicMailHost(input: string) {
  const normalized = domainToASCII(input.trim().replace(/\.$/, '').toLowerCase())
  if (!normalized || normalized.length > 253 || normalized.includes('..') || normalized.endsWith('.local') || normalized.endsWith('.internal')) {
    throw new MailboxProviderError('invalid_message')
  }
  if (net.isIP(normalized)) throw new MailboxProviderError('invalid_message')
  const labels = normalized.split('.')
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    throw new MailboxProviderError('invalid_message')
  }
  const records = await withTimeout(dns.lookup(normalized, { all: true, family: 4, verbatim: true }))
  if (!records.length || records.length > 16 || records.some((record) => !publicIpv4(record.address))) {
    throw new MailboxProviderError('invalid_message')
  }
  return { hostname: normalized, address: records[0].address }
}

async function assertMailboxHostScope(host: string, address: string) {
  const emailDomain = domainToASCII(address.trim().toLowerCase().split('@').at(-1) ?? '')
  if (!emailDomain) throw new MailboxProviderError('invalid_message')
  if (isMailboxRelatedHost(host, emailDomain, [])) return
  let mxHosts: string[]
  try {
    mxHosts = (await withTimeout(dns.resolveMx(emailDomain))).slice(0, 16).map((record) => record.exchange)
  } catch {
    throw new MailboxProviderError('invalid_message')
  }
  if (!mxHosts.length || !isMailboxRelatedHost(host, emailDomain, mxHosts)) {
    throw new MailboxProviderError('invalid_message')
  }
}

function configFor(connection: MailboxConnectionRecord): ImapSmtpConfig {
  const value = decryptMailboxConfig(connection.credentials_encrypted) as unknown as ImapSmtpConfig
  if (!value || value.address !== connection.provider_account_email || !value.username || !value.password) {
    throw new MailboxProviderError('reconnect_required')
  }
  return value
}

async function withTimeout<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MailboxProviderError('provider_unavailable')), OPERATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function openImap(config: ImapSmtpConfig) {
  const host = await resolvePublicMailHost(config.imapHost)
  await assertMailboxHostScope(host.hostname, config.address)
  const client = new ImapFlow({
    host: host.address,
    servername: host.hostname,
    port: config.imapPort,
    secure: true,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.username, pass: config.password },
    logger: false,
    logRaw: false,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: OPERATION_TIMEOUT_MS,
  })
  await withTimeout(client.connect())
  return client
}

async function createSmtpTransport(config: ImapSmtpConfig): Promise<Transporter> {
  const host = await resolvePublicMailHost(config.smtpHost)
  await assertMailboxHostScope(host.hostname, config.address)
  return nodemailer.createTransport({
    host: host.address,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort === 587,
    tls: { servername: host.hostname, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.username, pass: config.password },
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: OPERATION_TIMEOUT_MS,
    logger: false,
    debug: false,
  })
}

export class ImapSmtpMailboxProvider implements MailboxProvider {
  readonly provider = 'imap' as const
  private readonly config: ImapSmtpConfig
  private readonly connectionId: string
  constructor(connection: MailboxConnectionRecord) {
    this.config = configFor(connection)
    this.connectionId = connection.id
  }

  async testConnection() {
    const results = await testImapSmtpConfig(this.config)
    if (!results.imap || !results.smtp) throw new MailboxProviderError('provider_error')
  }

  async listMessages(folder: MailboxFolder, cursor?: string | null, limit = PAGE_SIZE, filter: MailboxFilter = 'all'): Promise<MailboxPage> {
    const client = await openImap(this.config)
    try {
      const path = folder === 'inbox' ? 'INBOX' : await sentFolder(client)
      const mailbox = await client.mailboxOpen(path, { readOnly: true })
      const pageLimit = Math.min(Math.max(limit, 1), PAGE_SIZE)
      if (filter === 'unread' && folder === 'inbox') {
        const unreadUids = await client.search({ seen: false }, { uid: true })
        const allUids = Array.isArray(unreadUids) ? unreadUids : []
        const offset = cursor ? Number.parseInt(cursor, 10) : 0
        if (!Number.isSafeInteger(offset) || offset < 0) throw new MailboxProviderError('invalid_message')
        const end = Math.max(0, allUids.length - offset)
        const start = Math.max(0, end - pageLimit)
        const selected = allUids.slice(start, end).reverse()
        if (!selected.length) return { messages: [], nextCursor: null }
        const rows = await client.fetchAll(selected, {
          uid: true, flags: true, internalDate: true, envelope: true, bodyStructure: true,
        }, { uid: true })
        const messages = rows.map((message): MailboxMessageSummary => {
          const from = message.envelope?.from?.[0]
          const id = `${path}:${message.uid}`
          return {
            id, providerMessageId: id, provider: this.provider, connectionId: this.connectionId,
            threadId: message.envelope?.messageId ?? null,
            mailboxId: this.connectionId, mailboxEmail: this.config.address, folder,
            from: { name: from?.name ?? null, email: from?.address ?? '' },
            to: message.envelope?.to?.map((address) => address.address ?? '').filter(Boolean) ?? [],
            subject: message.envelope?.subject ?? '', snippet: '',
            receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null,
            isRead: message.flags?.has('\\Seen') ?? false,
            hasAttachments: hasAttachment(message.bodyStructure),
          }
        }).reverse()
        const nextOffset = offset + selected.length
        return { messages, nextCursor: nextOffset < allUids.length ? String(nextOffset) : null }
      }
      const end = cursor ? Number.parseInt(cursor, 10) : mailbox.exists
      if (!Number.isSafeInteger(end) || end < 1 || mailbox.exists < 1) return { messages: [], nextCursor: null }
      const start = Math.max(1, end - pageLimit + 1)
      const rows: MailboxMessageSummary[] = []
      for await (const message of client.fetch(`${start}:${Math.min(end, mailbox.exists)}`, {
        uid: true, flags: true, internalDate: true, envelope: true, bodyStructure: true,
      })) {
        const from = message.envelope?.from?.[0]
        rows.push({
          id: `${path}:${message.uid}`,
          providerMessageId: `${path}:${message.uid}`,
          provider: this.provider,
          connectionId: this.connectionId,
          threadId: message.envelope?.messageId ?? null,
          mailboxId: this.connectionId,
          mailboxEmail: this.config.address,
          folder,
          from: { name: from?.name ?? null, email: from?.address ?? '' },
          to: message.envelope?.to?.map((address) => address.address ?? '').filter(Boolean) ?? [],
          subject: message.envelope?.subject ?? '',
          snippet: '',
          receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null,
          isRead: message.flags?.has('\\Seen') ?? false,
          hasAttachments: hasAttachment(message.bodyStructure),
        })
      }
      return { messages: rows.reverse(), nextCursor: start > 1 ? String(start - 1) : null }
    } finally {
      await client.logout().catch(() => undefined)
    }
  }

  async getMessage(folder: MailboxFolder, id: string): Promise<MailboxMessage> {
    const { path, uid } = parseImapId(id)
    const client = await openImap(this.config)
    try {
      await client.mailboxOpen(path, { readOnly: true })
      const metadata = await client.fetchOne(String(uid), { uid: true, flags: true, envelope: true, bodyStructure: true }, { uid: true })
      if (!metadata) throw new MailboxProviderError('invalid_message')
      const textPart = findTextPart(metadata?.bodyStructure)
      if (!textPart || (textPart.size ?? 0) > 2_000_000) throw new MailboxProviderError('invalid_message')
      const downloaded = await withTimeout(client.download(String(uid), textPart.part, { uid: true }))
      if (!downloaded.content) throw new MailboxProviderError('invalid_message')
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of downloaded.content) {
        const buffer = Buffer.from(chunk)
        size += buffer.length
        if (size > 2_000_000) throw new MailboxProviderError('invalid_message')
        chunks.push(buffer)
      }
      const parsed = await simpleParser(Buffer.concat(chunks))
      const envelope = metadata?.envelope
      const from = envelope?.from?.[0]
      const recipients = envelope?.to ?? []
      return {
        id,
        providerMessageId: id,
        provider: this.provider,
        connectionId: this.connectionId,
        threadId: parsed.messageId ?? null,
        mailboxId: this.connectionId,
        mailboxEmail: this.config.address,
        folder,
        from: { name: from?.name ?? null, email: from?.address ?? '' },
        to: recipients.map((address) => address.address ?? '').filter(Boolean),
        subject: envelope?.subject ?? '',
        snippet: parsed.text?.slice(0, 240) ?? '',
        receivedAt: metadata?.internalDate ? new Date(metadata.internalDate).toISOString() : null,
        isRead: metadata ? metadata.flags?.has('\\Seen') ?? false : false,
        hasAttachments: parsed.attachments.length > 0,
        textBody: parsed.text ?? '',
        replyTo: envelope?.messageId ?? null,
        references: [],
      }
    } finally {
      await client.logout().catch(() => undefined)
    }
  }

  async setRead(_folder: MailboxFolder, id: string, read: boolean) {
    const { path, uid } = parseImapId(id)
    const client = await openImap(this.config)
    try {
      await client.mailboxOpen(path)
      if (read) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
    } finally {
      await client.logout().catch(() => undefined)
    }
  }

  async sendMessage(input: MailboxSendInput) {
    const transporter = await createSmtpTransport(this.config)
    try {
      await withTimeout(transporter.sendMail({
        from: { name: this.config.displayName || this.config.address, address: this.config.address },
        to: input.to,
        cc: input.cc,
        subject: cleanHeader(input.subject),
        text: input.text,
      }))
    } finally {
      transporter.close()
    }
  }

  async reply(input: MailboxSendInput) {
    if (!input.replyToMessageId) throw new MailboxProviderError('invalid_message')
    const original = await this.getMessage('inbox', input.replyToMessageId)
    const transporter = await createSmtpTransport(this.config)
    try {
      await withTimeout(transporter.sendMail({
        from: { name: this.config.displayName || this.config.address, address: this.config.address },
        to: input.to.length ? input.to : [original.from.email],
        cc: input.cc,
        subject: cleanHeader(input.subject || (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`)),
        text: input.text,
        inReplyTo: original.replyTo ?? undefined,
        references: original.references,
      }))
    } finally {
      transporter.close()
    }
  }

  async disconnect() {}
}

export async function testImapSmtpConfig(config: ImapSmtpConfig) {
  let imap = false
  let smtp = false
  try {
    const client = await openImap(config)
    try {
      await withTimeout(client.list())
      imap = true
    } finally {
      await client.logout().catch(() => undefined)
    }
  } catch { imap = false }
  try {
    const transporter = await createSmtpTransport(config)
    try {
      await withTimeout(transporter.verify())
      smtp = true
    } finally {
      transporter.close()
    }
  } catch { smtp = false }
  return { imap, smtp }
}

async function sentFolder(client: ImapFlow) {
  const folders = await client.list()
  const sent = folders.find((folder) => folder.specialUse?.toLowerCase() === '\\sent')
    ?? folders.find((folder) => /^(sent|sent items|sent messages)$/i.test(folder.name))
  return sent?.path ?? 'Sent'
}

function parseImapId(value: string) {
  const separator = value.lastIndexOf(':')
  const path = value.slice(0, separator)
  const uid = Number.parseInt(value.slice(separator + 1), 10)
  if (separator < 1 || !Number.isSafeInteger(uid) || uid < 1 || path.length > 200) throw new MailboxProviderError('invalid_message')
  return { path, uid }
}

function hasAttachment(node: { disposition?: string; childNodes?: Array<unknown> } | undefined): boolean {
  if (!node) return false
  if (node.disposition?.toLowerCase() === 'attachment') return true
  return (node.childNodes ?? []).some((child) => hasAttachment(child as { disposition?: string; childNodes?: Array<unknown> }))
}

interface TextPartNode {
  type?: string
  part?: string
  disposition?: string
  size?: number
  childNodes?: TextPartNode[]
}

function findTextPart(node: TextPartNode | undefined): TextPartNode | null {
  if (!node || node.disposition?.toLowerCase() === 'attachment') return null
  if (node.type?.toLowerCase() === 'text/plain' && node.part) return node
  for (const child of node.childNodes ?? []) {
    const result = findTextPart(child)
    if (result) return result
  }
  return null
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
