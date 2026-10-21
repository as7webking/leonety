import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { mailboxDefaultStorageKey, readDefaultMailboxId, resolveComposeMailboxId, resolveDefaultMailboxId, writeDefaultMailboxId } from './default-preference.ts'

test('default preference keys are isolated by authenticated user and workspace', () => {
  assert.notEqual(mailboxDefaultStorageKey('user-a', 'workspace'), mailboxDefaultStorageKey('user-b', 'workspace'))
  assert.notEqual(mailboxDefaultStorageKey('user-a', 'workspace-a'), mailboxDefaultStorageKey('user-a', 'workspace-b'))
})

test('default falls back only to a connected mailbox and returns empty if none are connected', () => {
  const connections = [{ id: 'a', status: 'disabled' }, { id: 'b', status: 'connected' }]
  assert.equal(resolveDefaultMailboxId('a', connections), 'b')
  assert.equal(resolveDefaultMailboxId('b', connections), 'b')
  assert.equal(resolveDefaultMailboxId('a', [{ id: 'a', status: 'disabled' }]), '')
})

test('compose uses the default, while reply always stays on the receiving mailbox', () => {
  const connections = [{ id: 'default', status: 'connected' }, { id: 'received', status: 'connected' }]
  assert.equal(resolveComposeMailboxId(null, 'default', connections), 'default')
  assert.equal(resolveComposeMailboxId('received', 'default', connections), 'received')
  assert.equal(resolveComposeMailboxId('disconnected-receiver', 'default', connections), 'disconnected-receiver')
})

test('default preference read/write failures are harmless', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const key = mailboxDefaultStorageKey('user', 'workspace')
  assert.equal(writeDefaultMailboxId(storage, key, 'mailbox'), true)
  assert.equal(readDefaultMailboxId(storage, key), 'mailbox')
  assert.equal(writeDefaultMailboxId(storage, key, null), true)
  assert.equal(readDefaultMailboxId(storage, key), '')
  assert.equal(readDefaultMailboxId({ getItem: () => { throw new Error('storage disabled') } }, key), '')
})
