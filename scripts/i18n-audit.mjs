import fs from 'node:fs'
import path from 'node:path'
import Module, { createRequire } from 'node:module'
import ts from 'typescript'

const root = process.cwd()
const require = createRequire(import.meta.url)
const reportPath = path.join(root, 'reports/i18n-audit.json')

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'landing'].includes(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file, files)
    else files.push(file)
  }
  return files
}

function loadDictionaries() {
  const originalResolve = Module._resolveFilename
  Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    const resolvedRequest = request.startsWith('@/')
      ? path.join(root, 'src', request.slice(2))
      : request
    return originalResolve.call(this, resolvedRequest, parent, isMain, options)
  }

  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    module._compile(output, filename)
  }

  try {
    return require(path.join(root, 'src/lib/i18n.ts'))
  } finally {
    Module._resolveFilename = originalResolve
  }
}

function relative(file) {
  return path.relative(root, file)
}

function collectUsedKeys(files) {
  const used = new Map()
  const patterns = [/\bt\(\s*['"]([^'"]+)['"]/g, /<T\s+[^>]*\bk=['"]([^'"]+)['"]/g]
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(source))) {
        const line = source.slice(0, match.index).split('\n').length
        const usages = used.get(match[1]) ?? []
        usages.push({ file: relative(file), line })
        used.set(match[1], usages)
      }
    }
  }
  return used
}

function isProbablyUserVisible(value) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length < 2 || !/\p{L}/u.test(text)) return false
  if (/^(use client|use server|https?:|\/|#|\.)/.test(text)) return false
  if (/^(Leonety|WooCommerce|OpenCart|Shopify|JPEG|WebP|PNG|CSV|PDF|EUR|USD)$/i.test(text)) return false
  return true
}

function collectHardcodedStrings(files) {
  const findings = []
  const attributes = new Set(['placeholder', 'aria-label', 'title', 'alt'])
  for (const file of files.filter((item) => item.endsWith('.tsx'))) {
    const source = fs.readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const add = (node, type, text) => findings.push({
      file: relative(file),
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      type,
      text,
    })

    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim()
        if (isProbablyUserVisible(text)) add(node, 'jsx-text', text)
      }
      if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(sourceFile))) {
        const initializer = node.initializer
        if (initializer && ts.isStringLiteral(initializer) && isProbablyUserVisible(initializer.text)) {
          add(node, `attribute:${node.name.getText(sourceFile)}`, initializer.text.trim())
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return findings
}

function main() {
  const appFiles = walk(path.join(root, 'src/app/(app)'))
  const sharedFiles = walk(path.join(root, 'src/components')).filter((file) =>
    !/(public-|legal-|cookie-|landing|hero|pricing)/i.test(relative(file))
  )
  const sourceFiles = [...appFiles, ...sharedFiles].filter((file) => /\.(ts|tsx)$/.test(file))
  const translationFiles = walk(path.join(root, 'src/lib')).filter((file) =>
    file.endsWith('-i18n.ts') || file.endsWith('/i18n.ts')
  )
  const { dictionaries, locales, missingTranslationKeys } = loadDictionaries()
  const englishKeys = new Set(Object.keys(dictionaries.en))
  const usedKeys = collectUsedKeys(sourceFiles)
  const usedMissingInEnglish = [...usedKeys.keys()].filter((key) => !englishKeys.has(key)).sort()
  const coverage = {}

  for (const locale of locales) {
    const missing = missingTranslationKeys[locale]
    coverage[locale] = {
      translated: englishKeys.size - missing.length,
      total: englishKeys.size,
      percent: Number((((englishKeys.size - missing.length) / englishKeys.size) * 100).toFixed(2)),
      missing,
      usedMissing: missing.filter((key) => usedKeys.has(key)),
    }
  }

  const hardcodedStrings = collectHardcodedStrings(sourceFiles)
  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'Authenticated application only; public landing excluded.',
    locales,
    translationFiles: translationFiles.map(relative).sort(),
    coverage,
    usedMissingInEnglish: usedMissingInEnglish.map((key) => ({ key, usages: usedKeys.get(key) })),
    hardcodedStrings,
    summary: {
      englishKeyCount: englishKeys.size,
      authenticatedSourceFileCount: sourceFiles.length,
      usedMissingInEnglishCount: usedMissingInEnglish.length,
      hardcodedStringSuspectCount: hardcodedStrings.length,
    },
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Authenticated i18n audit written to ${relative(reportPath)}`)
  console.log(`Canonical English keys: ${englishKeys.size}`)
  for (const locale of locales) {
    const result = coverage[locale]
    console.log(`${locale}: ${result.percent}% (${result.translated}/${result.total}); used fallback keys: ${result.usedMissing.length}`)
  }
  console.log(`Unknown English keys used by UI: ${usedMissingInEnglish.length}`)
  console.log(`Hardcoded UI suspects for manual review: ${hardcodedStrings.length}`)

  if (usedMissingInEnglish.length > 0) process.exitCode = 1
}

main()
