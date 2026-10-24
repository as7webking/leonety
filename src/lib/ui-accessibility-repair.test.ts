import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const { getContractsCreateRedirect, isValidContractClientId } = await import(new URL('./contract-client-routing.ts', import.meta.url).href)
const { trapFocusWithin } = await import(new URL('./dialog-focus.ts', import.meta.url).href)

const confirmDialog = readFileSync(new URL('../components/confirm-dialog.tsx', import.meta.url), 'utf8')
const drawer = readFileSync(new URL('../components/app-shell/mobile-drawer-client.tsx', import.meta.url), 'utf8')
const contractsPage = readFileSync(new URL('../app/(app)/contracts/page.tsx', import.meta.url), 'utf8')
const contractNewPage = readFileSync(new URL('../app/(app)/contracts/new/page.tsx', import.meta.url), 'utf8')

function focusFixture(count: number, activeIndex: number) {
  const document = { activeElement: null as unknown as HTMLElement }
  const elements = Array.from({ length: count }, () => ({
    focus() { document.activeElement = this as unknown as HTMLElement },
    hidden: false,
    getAttribute: () => null,
  }))
  if (activeIndex >= 0) document.activeElement = elements[activeIndex] as unknown as HTMLElement
  const container = {
    ownerDocument: document,
    querySelectorAll: () => elements,
    focus() { document.activeElement = this as unknown as HTMLElement },
  }
  return { document, elements, container: container as unknown as HTMLElement }
}

function tabEvent(shiftKey = false) {
  let prevented = false
  return {
    event: { key: 'Tab', shiftKey, preventDefault: () => { prevented = true } },
    wasPrevented: () => prevented,
  }
}

test('ConfirmDialog exposes modal semantics, focuses safe cancel, traps keys, restores opener, and guards actions', () => {
  assert.match(confirmDialog, /role="dialog" aria-modal="true" aria-labelledby=\{titleId\}/)
  assert.match(confirmDialog, /aria-describedby=\{description \? descriptionId : undefined\}/)
  assert.match(confirmDialog, /max-w-md[\s\S]*?p-5/)
  assert.match(confirmDialog, /overflow-y-auto/)
  assert.match(confirmDialog, /flex flex-col justify-end gap-2 sm:flex-row/)
  assert.match(confirmDialog, /cancelButtonRef\.current\?\.focus\(\)/)
  assert.match(confirmDialog, /opener\?\.isConnected\) opener\.focus\(\)/)
  assert.match(confirmDialog, /event\.key === 'Escape'/)
  assert.match(confirmDialog, /trapFocusWithin\(dialogRef\.current, event\)/)
  assert.match(confirmDialog, /if \(confirmingRef\.current\) return/)
  assert.match(confirmDialog, /onClick=\{onCancel\}/)
  assert.match(confirmDialog, /onClick=\{\(\) => void handleConfirm\(\)\}/)
})

test('focus trap wraps Tab and Shift+Tab without allowing focus to escape', () => {
  const forward = focusFixture(2, 1)
  const forwardEvent = tabEvent()
  trapFocusWithin(forward.container, forwardEvent.event)
  assert.equal(forward.document.activeElement, forward.elements[0])
  assert.equal(forwardEvent.wasPrevented(), true)

  const backward = focusFixture(2, 0)
  const backwardEvent = tabEvent(true)
  trapFocusWithin(backward.container, backwardEvent.event)
  assert.equal(backward.document.activeElement, backward.elements[1])
  assert.equal(backwardEvent.wasPrevented(), true)

  const outside = focusFixture(2, -1)
  trapFocusWithin(outside.container, tabEvent().event)
  assert.equal(outside.document.activeElement, outside.elements[0])
})

test('mobile drawer retains Escape and focus restoration while trapping Tab', () => {
  assert.match(drawer, /role="dialog"/)
  assert.match(drawer, /event\.key === 'Escape'/)
  assert.match(drawer, /previousFocus\?\.focus\(\)/)
  assert.match(drawer, /trapFocusWithin\(drawerRef\.current, event\)/)
  assert.match(drawer, /onClick=\{\(\) => setOpen\(false\)\}/)
})

test('contract redirect preserves only a valid client UUID, safely URL-encoded', () => {
  const clientId = '123e4567-e89b-12d3-a456-426614174000'
  assert.equal(isValidContractClientId(clientId), true)
  assert.equal(isValidContractClientId('not-a-uuid'), false)
  assert.equal(isValidContractClientId(['123e4567-e89b-12d3-a456-426614174000']), false)
  assert.equal(getContractsCreateRedirect(clientId), `/app/contracts?mode=create&clientId=${encodeURIComponent(clientId)}`)
  assert.equal(getContractsCreateRedirect(undefined), '/app/contracts?mode=create')
  assert.equal(getContractsCreateRedirect('https://example.com'), '/app/contracts?mode=create')
  assert.match(contractNewPage, /searchParams: Promise/)
  assert.match(contractNewPage, /getContractsCreateRedirect\(params\.clientId\)/)
  assert.match(contractsPage, /const preselectedClientId = searchParams\.get\('clientId'\)/)
  assert.match(contractsPage, /clients\.find\(\(item\) => item\.id === preselectedClientId\)/)
  assert.match(contractsPage, /if \(!client\) return/)
  assert.match(contractsPage, /clientsWorkspaceId !== currentCompany\?\.id/)
  assert.match(contractsPage, /fillPartyBFromClient\(client\)/)
  assert.match(contractsPage, /\.from\('clients'\)[\s\S]*?\.eq\('company_id', currentCompany\.id\)/)
})

test('contracts list retains one page-level create action', () => {
  const createRouteLinks = contractsPage.match(/href="\/app\/contracts\/new"/g) ?? []
  assert.equal(createRouteLinks.length, 1)
})
