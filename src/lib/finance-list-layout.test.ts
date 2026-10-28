import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const financeList = readFileSync(new URL('../components/finance/finance-list.tsx', import.meta.url), 'utf8')

test('mobile finance rows give amount and conversion metadata a full-width row', () => {
  assert.match(css, /\.finance-list-grid\s*{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0, 1fr\) max-content/)
  assert.match(css, /\.finance-list-grid > :nth-child\(4\)\s*{\s*grid-column:\s*1 \/ 3;\s*grid-row:\s*4/)
  assert.match(financeList, /grid min-w-0 max-w-full gap-1 text-left lg:text-right/)
  assert.match(financeList, /whitespace-normal break-words text-xs leading-4[\s\S]*overflow-wrap:anywhere/)
})

test('desktop finance list retains its six-column table layout', () => {
  assert.match(css, /@media \(min-width:\s*1024px\)\s*{\s*\.finance-list-grid\s*{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.5fr\)[\s\S]*minmax\(176px, max-content\)/)
})
