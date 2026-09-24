import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { buildLeonetyAssistantKnowledge, normalizeAssistantRoute } from './leonety-assistant-knowledge.ts'

test('grounds implemented employee, product, notification and Kassenbuch workflows', () => {
  const knowledge = JSON.parse(buildLeonetyAssistantKnowledge('en', '/app/settings/integrations/woocommerce'))
  assert.match(knowledge.features.notifications, /Settings > Notifications/)
  assert.match(knowledge.features.products, /same product editor/)
  assert.match(knowledge.features.kassenbuch, /print-only five-column cash-book view/)
  assert.match(knowledge.features.employees, /dedicated list, create, profile and edit pages/)
  assert.ok(knowledge.commonTasks.some((task: string) => task.startsWith('Create an invoice:')))
  assert.ok(knowledge.commonTasks.some((task: string) => task.startsWith('Enable system notifications:')))
  assert.ok(knowledge.commonTasks.some((task: string) => task.startsWith('Edit a product:')))
  assert.ok(knowledge.commonTasks.some((task: string) => task.startsWith('Print Kassenbuch:')))
})

test('normalizes only real supported authenticated routes', () => {
  assert.equal(normalizeAssistantRoute('/app/employees/employee-id/edit'), '/app/employees')
  assert.equal(normalizeAssistantRoute('/app/products/product-id/edit'), '/app/products')
  assert.equal(normalizeAssistantRoute('/app/nonexistent'), '/app/dashboard')
})
