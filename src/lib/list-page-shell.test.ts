import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const clients = read('../app/(app)/clients/page.tsx')
const products = read('../app/(app)/products/page.tsx')
const invoices = read('../app/(app)/invoices/page.tsx')
const contracts = read('../app/(app)/contracts/page.tsx')

test('client list keeps its page heading during loading and workspace empty states', () => {
  assert.match(clients, /if \(companyLoading\) return <PageContainer><PageHeader title=\{t\('clients\.title'\)\} \/><LoadingSkeleton \/><\/PageContainer>/)
  assert.match(clients, /if \(!currentCompany\) return <PageContainer><PageHeader title=\{t\('clients\.title'\)\} \/><EmptyState/)
  assert.match(clients, /if \(currentCompany\.type !== 'business'\) return <PageContainer><PageHeader title=\{t\('clients\.title'\)\} \/><EmptyState/)
})

test('product and contract workspace empty states retain the same page heading as their loaded views', () => {
  assert.match(products, /if \(!currentCompany\) return <PageContainer><PageHeader title=\{t\('products\.title'\)\} \/><EmptyState/)
  assert.match(contracts, /if \(!currentCompany\) \{\s*return <PageContainer><PageHeader title=\{pageMode === 'create' \? t\('contracts\.create'\) : t\('contracts\.title'\)\} \/><EmptyState/)
})

test('invoice list keeps a page heading in loading, workspace-empty and loaded states', () => {
  assert.match(invoices, /if \(companyLoading \|\| loading\) \{[\s\S]*?<PageHeader title=\{t\('invoices\.title'\)\}/)
  assert.match(invoices, /if \(!currentCompany\) \{[\s\S]*?<PageHeader title=\{t\('invoices\.title'\)\}/)
  assert.match(invoices, /<PageHeader title=\{t\('invoices\.title'\)\} description=\{`\$\{t\('invoices\.description'\)\}/)
})
