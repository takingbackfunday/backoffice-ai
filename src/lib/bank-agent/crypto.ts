import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function deriveKey(userId: string): Buffer {
  const secret = process.env.ENCRYPTION_SECRET || 'dev-secret-change-in-production'
  return createHash('sha256').update(secret + userId).digest()
}

export function encrypt(plaintext: string, userId: string) {
  const key = deriveKey(userId)
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return { ciphertext: encrypted, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') }
}

export function decrypt(ciphertext: string, iv: string, authTag: string, userId: string): string {
  const key = deriveKey(userId)
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(authTag, 'hex'))
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}