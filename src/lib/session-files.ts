import { headerSignature } from './import-signature'
import type { UploadFile } from '@/types'

export interface AddFilesResult {
  accepted: UploadFile[]
  rejected: { filename: string; reason: string }[]
}

export const MAX_FILES = 10

/**
 * Pure logic for accepting/rejecting files into an upload session.
 *
 * Rules:
 * - The first file sets the session signature; all subsequent files must match.
 * - Total file count (existing + new) must not exceed MAX_FILES.
 * - Duplicate filenames are rejected.
 */
export function addFiles(
  existing: UploadFile[],
  sessionSignature: string | null,
  incoming: UploadFile[]
): AddFilesResult {
  const accepted: UploadFile[] = []
  const rejected: { filename: string; reason: string }[] = []
  const existingNames = new Set(existing.map((f) => f.filename))

  let sig = sessionSignature

  for (const file of incoming) {
    if (existing.length + accepted.length >= MAX_FILES) {
      rejected.push({ filename: file.filename, reason: `Maximum ${MAX_FILES} files per upload.` })
      continue
    }

    const fileSig = headerSignature(file.headers)

    if (sig === null) {
      sig = fileSig
    } else if (fileSig !== sig) {
      rejected.push({
        filename: file.filename,
        reason: 'Different columns — upload it separately.',
      })
      continue
    }

    if (existingNames.has(file.filename)) {
      rejected.push({ filename: file.filename, reason: 'Already added.' })
      continue
    }

    existingNames.add(file.filename)
    accepted.push(file)
  }

  return { accepted, rejected }
}
