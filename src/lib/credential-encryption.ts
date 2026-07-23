import 'server-only'
import crypto from 'node:crypto'

const ENCRYPTED_PREFIX = 'enc:v1'
const ENV_NAME = 'LEONETY_CREDENTIAL_ENCRYPTION_KEY'

function getEncryptionKey() {
  const secret = process.env[ENV_NAME]

  if (!secret || secret.trim().length < 32) {
    throw new Error(`${ENV_NAME} must be set server-side before saving integration secrets.`)
  }

  return crypto.createHash('sha256').update(secret).digest()
}

export function isEncryptedSecret(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTED_PREFIX}:`)
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
  if (!isEncryptedSecret(value)) return value

  const [, , ivText, tagText, encryptedText] = value.split(':')
  if (!ivText || !tagText || !encryptedText) {
    throw new Error('Saved integration secret is not readable.')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivText, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskSecret(value: string | null | undefined) {
  const secret = decryptSecret(value)
  if (!secret) return ''
  if (secret.length <= 8) return '••••••••'
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`
}
