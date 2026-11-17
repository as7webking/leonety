import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const products = readFileSync(new URL('../app/(app)/products/page.tsx', import.meta.url), 'utf8')
const transactions = readFileSync(new URL('../app/(app)/transactions/page.tsx', import.meta.url), 'utf8')

test('product and transaction reloads abort old workspace requests and reject stale results', () => {
  for (const [name, source, refName] of [
    ['Products', products, 'productLoadControllerRef'],
    ['Transactions', transactions, 'transactionLoadControllerRef'],
  ] as const) {
    assert.match(source, new RegExp(`${refName}\\.current\\?\\.abort\\(\\)`), `${name}: previous request should be cancelled`)
    assert.match(source, /currentWorkspaceIdRef\.current = currentCompany\?\.id \?\? null/, `${name}: current scope is tracked during render`)
    assert.match(source, new RegExp(`currentWorkspaceIdRef\\.current !== workspaceId`), `${name}: old workspace response should be ignored`)
    assert.match(source, new RegExp(`${refName}\\.current === controller`), `${name}: only the active request may publish results`)
    assert.match(source, /return \(\) => .*\.current\?\.abort\(\)/, `${name}: navigation/unmount should abort in-flight loading`)
    assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*displayedWorkspaceIdRef\.current !== workspaceId|useLayoutEffect\(\(\) => \{[\s\S]*displayedWorkspaceIdRef\.current === workspaceId/, `${name}: previous workspace data is cleared before paint`)
  }
  assert.match(products, /setProducts\(\[\]\)[\s\S]*setSelectedProductIds\(new Set\(\)\)/)
  assert.match(transactions, /setTransactions\(\[\]\)[\s\S]*setSelectedTransactions\(\[\]\)/)
  assert.match(products, /fetch\(`\/api\/store-integrations[\s\S]*signal: controller\.signal/)
  assert.match(transactions, /\.abortSignal\(controller\.signal\)/)
})
