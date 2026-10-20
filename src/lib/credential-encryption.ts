import 'server-only'
import crypto from 'node:crypto'

const ENCRYPTED_PREFIX = 'enc:v1'
const ENV_NAME = 'LEONETY_CREDENTIAL_ENCRYPTION_KEY'
const INVALID_CREDENTIAL_ERROR = 'Saved credential is invalid or cannot be decrypted.'

export type CredentialFormat =
  | 'CURRENT_ENCRYPTED'
  | 'LEGACY_PLAINTEXT_OR_LEGACY_FORMAT'
  | 'INVALID_ENCRYPTED_VALUE'

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  const decoded = Buffer.from(value, 'base64url')
  return decoded.toString('base64url') === value ? decoded : null
}

function parseCurrentCiphertext(value: string) {
  const parts = value.split(':')
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') return null

  const iv = decodeBase64Url(parts[2])
  const tag = decodeBase64Url(parts[3])
  const ciphertext = decodeBase64Url(parts[4])
  if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext) return null
  return { iv, tag, ciphertext }
}

function getEncryptionKey() {
  const secret = process.env[ENV_NAME]

  if (!secret || secret.trim().length < 32) {
    throw new Error(`${ENV_NAME} must be set server-side before saving integration secrets.`)
  }

  return crypto.createHash('sha256').update(secret).digest()
}

export function isEncryptedSecret(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith('enc:')
}

export function classifySecretFormat(value: string | null | undefined): CredentialFormat {
  if (typeof value !== 'string' || !value.startsWith('enc:')) {
    return 'LEGACY_PLAINTEXT_OR_LEGACY_FORMAT'
  }
  return parseCurrentCiphertext(value) ? 'CURRENT_ENCRYPTED' : 'INVALID_ENCRYPTED_VALUE'
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return ''
  const format = classifySecretFormat(value)
  if (format === 'LEGACY_PLAINTEXT_OR_LEGACY_FORMAT') return value
  if (format === 'INVALID_ENCRYPTED_VALUE') throw new Error(INVALID_CREDENTIAL_ERROR)

  const parsed = parseCurrentCiphertext(value)
  if (!parsed) throw new Error(INVALID_CREDENTIAL_ERROR)

  let decipher: crypto.DecipherGCM
  try {
    decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), parsed.iv)
    decipher.setAuthTag(parsed.tag)
    return Buffer.concat([
      decipher.update(parsed.ciphertext),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new Error(INVALID_CREDENTIAL_ERROR)
  }
}

export function maskSecret(value: string | null | undefined) {
  const secret = decryptSecret(value)
  if (!secret) return ''
  if (secret.length <= 8) return '••••••••'
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`
}
