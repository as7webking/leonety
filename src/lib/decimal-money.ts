function decimalParts(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value.trim())
  if (!match) throw new Error('Invalid decimal value')
  const fraction = match[3] ?? ''
  const digits = `${match[2]}${fraction}`
  const scale = fraction.length - Number(match[4] ?? 0)
  const expanded = scale <= 0
    ? `${digits}${'0'.repeat(-scale)}`
    : digits.length <= scale
      ? `0.${'0'.repeat(scale - digits.length)}${digits}`
      : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
  const [integer, expandedFraction = ''] = expanded.split('.')
  return {
    negative: match[1] === '-',
    coefficient: `${integer}${expandedFraction}`.replace(/^0+(?=\d)/, ''),
    scale: expandedFraction.length,
  }
}

function currencyDigits(currency: string) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
}

function multiplyIntegerStrings(left: string, right: string) {
  const digits = Array.from({ length: left.length + right.length }, () => 0)
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    let carry = 0
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const position = leftIndex + rightIndex + 1
      const value = Number(left[leftIndex]) * Number(right[rightIndex]) + digits[position] + carry
      digits[position] = value % 10
      carry = Math.floor(value / 10)
    }
    digits[leftIndex] += carry
  }
  return digits.join('').replace(/^0+(?=\d)/, '')
}

function incrementIntegerString(value: string) {
  const digits = value.split('')
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== '9') {
      digits[index] = String(Number(digits[index]) + 1)
      return digits.join('')
    }
    digits[index] = '0'
  }
  return `1${digits.join('')}`
}

export function roundDecimalToScale(value: string, scale: number) {
  const parts = decimalParts(value)
  const coefficient = parts.coefficient.padStart(scale + 1, '0')
  let rounded: string
  if (parts.scale <= scale) {
    rounded = `${parts.coefficient}${'0'.repeat(scale - parts.scale)}`
  } else {
    const keptLength = Math.max(0, coefficient.length - (parts.scale - scale))
    const kept = coefficient.slice(0, keptLength) || '0'
    rounded = (coefficient[keptLength] ?? '0') >= '5' ? incrementIntegerString(kept) : kept
  }
  rounded = rounded.padStart(scale + 1, '0')
  const sign = parts.negative && !/^0+$/.test(rounded) ? '-' : ''
  return scale === 0 ? `${sign}${rounded}` : `${sign}${rounded.slice(0, -scale)}.${rounded.slice(-scale)}`
}

export function multiplyMoneyByRate(amount: string, rate: string, currency: string) {
  const amountParts = decimalParts(amount)
  const rateParts = decimalParts(rate)
  const product = multiplyIntegerStrings(amountParts.coefficient, rateParts.coefficient)
  const productScale = amountParts.scale + rateParts.scale
  const outputScale = currencyDigits(currency)
  let rounded = product
  let negative = amountParts.negative !== rateParts.negative
  if (productScale <= outputScale) {
    rounded += '0'.repeat(outputScale - productScale)
  } else {
    const retainedLength = Math.max(0, product.length - (productScale - outputScale))
    const retained = product.slice(0, retainedLength) || '0'
    const firstDiscarded = product[retainedLength] ?? '0'
    rounded = firstDiscarded >= '5' ? incrementIntegerString(retained) : retained
  }
  rounded = rounded.padStart(outputScale + 1, '0')
  if (/^0+$/.test(rounded)) negative = false
  if (outputScale === 0) return `${negative ? '-' : ''}${rounded}`
  return `${negative ? '-' : ''}${rounded.slice(0, -outputScale)}.${rounded.slice(-outputScale)}`
}

export function getStoredWorkspaceAmount(record: {
  amount: number | string
  currency: string
  workspace_amount?: number | string | null
  workspace_currency?: string | null
  legacyWorkspaceCurrency?: string | null
}) {
  const recordCurrency = record.currency.trim().toUpperCase()
  const snapshotCurrency = record.workspace_currency
    ? record.workspace_currency.trim().toUpperCase()
    : record.legacyWorkspaceCurrency ? record.legacyWorkspaceCurrency.trim().toUpperCase() : null
  if (recordCurrency === snapshotCurrency) return String(record.amount)
  return record.workspace_amount === null || record.workspace_amount === undefined
    ? null
    : String(record.workspace_amount)
}
