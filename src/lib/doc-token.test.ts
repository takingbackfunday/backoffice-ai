import { describe, it, expect, vi } from 'vitest'
import { generateDocToken, verifyDocToken } from '@/lib/doc-token'

describe('doc-token', () => {
  describe('generateDocToken', () => {
    it('returns a non-empty string', () => {
      const token = generateDocToken('doc-123')
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
    })

    it('returns different tokens at different times', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
      const t1 = generateDocToken('doc-123')
      vi.setSystemTime(new Date('2024-01-01T00:00:01Z'))
      const t2 = generateDocToken('doc-123')
      vi.useRealTimers()
      expect(t1).not.toBe(t2)
    })
  })

  describe('verifyDocToken', () => {
    it('round-trips a valid token', () => {
      const token = generateDocToken('doc-456')
      const result = verifyDocToken(token)
      expect(result).not.toBeNull()
      expect(result?.documentId).toBe('doc-456')
    })

    it('rejects an invalid token', () => {
      const result = verifyDocToken('garbage-token')
      expect(result).toBeNull()
    })

    it('rejects a tampered token', () => {
      const token = generateDocToken('doc-789')
      // Tamper with the token
      const tampered = token.slice(0, -5) + 'XXXXX'
      const result = verifyDocToken(tampered)
      expect(result).toBeNull()
    })

    it('rejects an empty string', () => {
      expect(verifyDocToken('')).toBeNull()
    })

    it('rejects a token with wrong signature', () => {
      // Construct a fake token with valid structure but wrong sig
      const payload = 'doc-123:99999999999999'
      const fakeSig = 'a'.repeat(64)
      const fakeToken = Buffer.from(`${payload}:${fakeSig}`).toString('base64url')
      const result = verifyDocToken(fakeToken)
      expect(result).toBeNull()
    })

    it('documentId is correctly extracted', () => {
      const token = generateDocToken('my-document-id-abc')
      const result = verifyDocToken(token)
      expect(result?.documentId).toBe('my-document-id-abc')
    })
  })
})