import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.ENCRYPTION_SECRET ?? 'dev-secret'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function generateDocToken(documentId: string): string {
  const expires = Date.now() + TTL_MS
  const payload = `${documentId}:${expires}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyDocToken(token: string): { documentId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 3) return null
    const [documentId, expiresStr, sig] = parts
    const expires = parseInt(expiresStr, 10)
    if (Date.now() > expires) return null
    const payload = `${documentId}:${expiresStr}`
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    const sigBuf = Buffer.from(sig, 'hex')
    if (expectedBuf.length !== sigBuf.length) return null
    if (!timingSafeEqual(expectedBuf, sigBuf)) return null
    return { documentId }
  } catch {
    return null
  }
}
