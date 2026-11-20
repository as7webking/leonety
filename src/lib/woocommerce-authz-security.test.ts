import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const helper = readFileSync(new URL('../app/api/woocommerce/_utils.ts', import.meta.url), 'utf8')

test('workspace lookup failures do not expose raw Supabase diagnostics to API clients', () => {
  assert.match(helper, /if \(companyError\) \{\s*return \{ error: NextResponse\.json\(\{ error: 'Workspace authorization could not be verified\.' \}, \{ status: 500 \}\) \}/)
  assert.doesNotMatch(helper, /NextResponse\.json\(\{ error: companyError\.message \}/)
})
