import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()
const sourceRoot = join(root, 'src')

test('static internal navigation targets resolve to a current Next route', () => {
  const routeFiles = walk(join(sourceRoot, 'app')).filter((file) => /(?:^|[/\\])page\.(?:tsx|ts)$/.test(file))
  const routes = routeFiles.map((file) => {
    const parts = relative(join(sourceRoot, 'app'), file).split(sep).slice(0, -1)
      .filter((part) => !/^\([^)]*\)$/.test(part))
    return `/${parts.join('/')}`.replace(/\/$/, '') || '/'
  })
  const candidates = walk(sourceRoot).filter((file) => /\.(?:tsx|ts)$/.test(file) && !file.endsWith('.test.ts'))
  const broken: string[] = []

  for (const file of candidates) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'href' && node.initializer) {
        const target = staticValue(node.initializer, source)
        if (target) checkTarget(target, file, node, source, routes, broken)
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text
        if (['push', 'replace', 'assign'].includes(method) && node.arguments.length) {
          const target = staticValue(node.arguments[0], source)
          if (target) checkTarget(target, file, node, source, routes, broken)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  assert.deepEqual(broken, [], `Broken internal navigation targets:\n${broken.join('\n')}`)
})

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function staticValue(node: ts.Node, source: ts.SourceFile): string | null {
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isJsxExpression(node) && node.expression) return staticValue(node.expression, source)
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => `audit-value${span.literal.text}`).join('')
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticValue(node.left, source)
    const right = staticValue(node.right, source)
    return left !== null && right !== null ? left + right : null
  }
  return null
}

function checkTarget(value: string, file: string, node: ts.Node, source: ts.SourceFile, routes: string[], broken: string[]) {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/api/')) return
  let pathname: string
  try { pathname = new URL(value, 'https://leonety.invalid').pathname } catch { return }
  const candidates = [pathname]
  if (pathname.startsWith('/app/')) candidates.push(pathname.slice(4))
  else if (pathname !== '/') candidates.push(`/app${pathname}`)
  if (!candidates.some((candidate) => resolves(candidate, routes))) {
    const location = source.getLineAndCharacterOfPosition(node.getStart(source))
    broken.push(`${relative(root, file)}:${location.line + 1} -> ${value}`)
  }
}

function resolves(pathname: string, routes: string[]) {
  return routes.some((route) => routeMatches(pathname, route))
}

function routeMatches(pathname: string, route: string) {
  if (pathname === route) return true
  const pattern = route.split('/').map((segment) => {
    if (/^\[\.\.\..+\]$/.test(segment)) return '.+'
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return '.*'
    if (/^\[.+\]$/.test(segment)) return '[^/]+'
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('/')
  return new RegExp(`^${pattern}/?$`).test(pathname)
}
