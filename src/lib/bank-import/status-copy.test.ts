import { describe, expect, it } from 'vitest'
import { statusCopy } from './status-copy'

const base = { needsUserReason: null, bankName: 'Chase', queuedForMs: 0, errorMessage: null }

describe('statusCopy', () => {
  it('shows cold-start copy for a short queue', () => {
    expect(statusCopy({ ...base, status: 'QUEUED', queuedForMs: 10_000 }).title).toBe('Waking up the import service…')
  })

  it('shows a retry error for an expired queue', () => {
    expect(statusCopy({ ...base, status: 'QUEUED', queuedForMs: 95_000 }).tone).toBe('error')
  })

  it('asks for user help when the agent is stuck', () => {
    expect(statusCopy({ ...base, status: 'NEEDS_USER', needsUserReason: 'stuck' }).body).toContain('download the CSV yourself')
  })

  it('uses the supplied failure message', () => {
    expect(statusCopy({ ...base, status: 'FAILED', errorMessage: 'Browser service busy' }).body).toBe('Browser service busy')
  })
})
