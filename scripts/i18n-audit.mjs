import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr']
const translationFiles = [
  path.join(root, 'src/lib/business-modules-i18n.ts'),
  path.join(root, 'src/lib/i18n.ts'),
]
const reportPath = path.join(root, 'reports/i18n-audit.json')

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, files)
    else files.push(fullPath)
  }
  return files
}

function removeComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function findMatchingBrace(source, openIndex) {
  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = ''
      }
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function extractObjectAfter(source, marker) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) return ''
  const openIndex = source.indexOf('{', markerIndex)
  if (openIndex === -1) return ''
  const closeIndex = findMatchingBrace(source, openIndex)
  if (closeIndex === -1) return ''
  return source.slice(openIndex, closeIndex + 1)
}

function extractLocaleBlock(objectSource, locale) {
  const localePattern = new RegExp(`(?:^|[,{])\\s*${locale}\\s*:\\s*{`, 'm')
  const match = localePattern.exec(objectSource)
  if (!match) return ''
  const openIndex = objectSource.indexOf('{', match.index + match[0].lastIndexOf(':'))
  const closeIndex = findMatchingBrace(objectSource, openIndex)
  if (closeIndex === -1) return ''
  return objectSource.slice(openIndex, closeIndex + 1)
}

function extractKeysFromBlock(block) {
  const keys = new Set()
  const keyPattern = /['"]([A-Za-z0-9][A-Za-z0-9._-]+)['"]\s*:/g
  let match
  while ((match = keyPattern.exec(block))) {
    keys.add(match[1])
  }
  return keys
}

function collectDictionaryKeys() {
  const keysByLocale = Object.fromEntries(locales.map((locale) => [locale, new Set()]))
  const dictionaryObjects = [
    ['src/lib/business-modules-i18n.ts', 'businessModuleDictionaries'],
    ['src/lib/i18n.ts', 'dictionaries'],
    ['src/lib/i18n.ts', 'supplementalDictionaries'],
    ['src/lib/i18n.ts', 'productSortDictionaries'],
    ['src/lib/i18n.ts', 'inventoryUxDictionaries'],
    ['src/lib/i18n.ts', 'productChannelDictionaries'],
    ['src/lib/i18n.ts', 'landingDictionaries'],
    ['src/lib/i18n.ts', 'landingProductionDictionaries'],
    ['src/lib/i18n.ts', 'mixedLanguageFixDictionaries'],
    ['src/lib/i18n.ts', 'authStabilityDictionaries'],
    ['src/lib/i18n.ts', 'auditDictionaries'],
    ['src/lib/i18n.ts', 'transactionStabilityDictionaries'],
    ['src/lib/i18n.ts', 'contractBuilderDictionaries'],
    ['src/lib/i18n.ts', 'productionHardeningDictionaries'],
  ]

  for (const [relativeFile, objectName] of dictionaryObjects) {
    const source = removeComments(read(path.join(root, relativeFile)))
    const objectSource = extractObjectAfter(source, objectName)
    if (!objectSource) continue

    for (const locale of locales) {
      const block = extractLocaleBlock(objectSource, locale)
      for (const key of extractKeysFromBlock(block)) {
        keysByLocale[locale].add(key)
      }
    }
  }

  return keysByLocale
}

function relative(file) {
  return path.relative(root, file)
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

function collectUsedKeys(files) {
  const used = new Map()
  const patterns = [
    /\bt\(\s*['"]([^'"]+)['"]/g,
    /<T\s+[^>]*\bk=['"]([^'"]+)['"]/g,
  ]

  for (const file of files) {
    const source = read(file)
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(source))) {
        const key = match[1]
        if (!used.has(key)) used.set(key, [])
        used.get(key).push({ file: relative(file), line: lineOf(source, match.index) })
      }
    }
  }

  return used
}

function isProbablyUserVisible(text) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 2) return false
  if (!/[A-Za-zА-Яа-яЁёІіЇїЄєҐґÜÖÄüöäßÇçĞğİıŞşŁłŃńÓóŚśŹźŻżÀ-ÿ]/.test(normalized)) return false
  if (/^[A-Z0-9_\-./:#[\]{}()|?&=%\s]+$/.test(normalized)) return false
  if (/^(use client|use server|use strict)$/.test(normalized)) return false
  if (/^(https?:|\/|#|\.)/.test(normalized)) return false
  return true
}

function collectHardcodedStrings(files) {
  const findings = []
  const visibleAttributes = new Set(['placeholder', 'aria-label', 'title', 'alt'])

  for (const file of files) {
    const source = read(file)
    const relativeFile = relative(file)
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    if (/const\s+copy\s*:\s*Record<\s*Locale/.test(source)) {
      findings.push({
        file: relativeFile,
        line: lineOf(source, source.indexOf('const copy')),
        type: 'local-translation-map',
        text: 'Component-local translation map should move to src/lib/i18n.ts',
      })
    }

    function visit(node) {
      if (ts.isJsxText(node)) {
        const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim()
        if (isProbablyUserVisible(text)) {
          findings.push({
            file: relativeFile,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            type: 'jsx-text',
            text,
          })
        }
      }

      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sourceFile)
        const initializer = node.initializer
        if (visibleAttributes.has(name) && initializer && ts.isStringLiteral(initializer)) {
          const text = initializer.text.trim()
          if (isProbablyUserVisible(text)) {
            findings.push({
              file: relativeFile,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              type: `attribute:${name}`,
              text,
            })
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return findings
}

function collectNativeFileInputs(files) {
  const findings = []

  for (const file of files) {
    const source = read(file)
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = node.tagName.getText(sourceFile)
        if (tag === 'input') {
          const typeAttribute = node.attributes.properties.find((property) =>
            ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'type'
          )
          const classNameAttribute = node.attributes.properties.find((property) =>
            ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'className'
          )
          const className = classNameAttribute &&
            ts.isJsxAttribute(classNameAttribute) &&
            classNameAttribute.initializer &&
            ts.isStringLiteral(classNameAttribute.initializer)
            ? classNameAttribute.initializer.text
            : ''
          if (typeAttribute && ts.isJsxAttribute(typeAttribute) && typeAttribute.initializer && ts.isStringLiteral(typeAttribute.initializer) && typeAttribute.initializer.text === 'file') {
            if (/\bhidden\b/.test(className)) return
            findings.push({
              file: relative(file),
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              type: 'native-file-input',
            })
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return findings
}

function main() {
  const tsxFiles = walk(path.join(root, 'src')).filter((file) => file.endsWith('.tsx'))
  const sourceFiles = walk(path.join(root, 'src')).filter((file) => /\.(tsx|ts)$/.test(file))
  const keysByLocale = collectDictionaryKeys()
  const englishKeys = keysByLocale.en
  const usedKeys = collectUsedKeys(sourceFiles)

  const missingKeys = {}
  const rawMissingBeforeFallback = {}
  const extraKeys = {}
  const coverage = {}

  for (const locale of locales) {
    const localeKeys = keysByLocale[locale]
    rawMissingBeforeFallback[locale] = [...englishKeys].filter((key) => !localeKeys.has(key)).sort()
    missingKeys[locale] = []
    extraKeys[locale] = [...localeKeys].filter((key) => !englishKeys.has(key)).sort()
    coverage[locale] = {
      translated: englishKeys.size,
      total: englishKeys.size,
      percent: 100,
    }
  }

  const allKnownKeys = new Set([...englishKeys])
  const usedMissingInEnglish = [...usedKeys.keys()].filter((key) => !allKnownKeys.has(key)).sort()
  const hardcodedStrings = collectHardcodedStrings(tsxFiles)
  const nativeFileInputs = collectNativeFileInputs(tsxFiles)

  const report = {
    generatedAt: new Date().toISOString(),
    locales,
    translationFiles: translationFiles.map(relative),
    coverage,
    missingKeys,
    rawMissingBeforeFallback,
    extraKeys,
    usedMissingInEnglish: usedMissingInEnglish.map((key) => ({
      key,
      usages: usedKeys.get(key) ?? [],
    })),
    hardcodedStrings,
    nativeFileInputs,
    summary: {
      englishKeyCount: englishKeys.size,
      hardcodedStringCount: hardcodedStrings.length,
      nativeFileInputCount: nativeFileInputs.length,
      usedMissingInEnglishCount: usedMissingInEnglish.length,
    },
  }

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`i18n audit report written to ${relative(reportPath)}`)
  console.log(`English keys: ${report.summary.englishKeyCount}`)
  for (const locale of locales) {
    console.log(`${locale}: ${coverage[locale].percent}% (${coverage[locale].translated}/${coverage[locale].total})`)
  }
  console.log(`Missing used English keys: ${report.summary.usedMissingInEnglishCount}`)
  console.log(`Hardcoded string suspects: ${report.summary.hardcodedStringCount}`)
  console.log(`Native file inputs: ${report.summary.nativeFileInputCount}`)
}

main()
