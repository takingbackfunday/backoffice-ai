'use client'

import { useCallback } from 'react'
import { headerSignature } from '@/lib/import-signature'
import { useUploadStore } from '@/stores/upload-store'
import { useUploadDropzoneStore } from '@/stores/upload-dropzone-store'
import type { UploadFile } from '@/types'

export function useIngestFiles(): (parsed: UploadFile[], parseErrors: { filename: string; reason: string }[], signal?: AbortSignal) => Promise<void> {
  const addFiles = useUploadStore((s) => s.addFiles)
  const setProfileHit = useUploadStore((s) => s.setProfileHit)
  const setProfileStatus = useUploadStore((s) => s.setProfileStatus)
  const setErrors = useUploadDropzoneStore((s) => s.setErrors)

  return useCallback(async (parsed, parseErrors, signal) => {
    if (signal?.aborted) return
    if (parsed.length === 0) {
      setErrors(parseErrors)
      return
    }

    const wasFirstUpload = useUploadStore.getState().files.length === 0
    if (wasFirstUpload) setProfileStatus('loading')
    const result = addFiles(parsed)

    const allErrors = [...parseErrors, ...result.rejected]
    if (allErrors.length > 0) setErrors(allErrors)

    if (!wasFirstUpload) return
    if (result.accepted.length === 0) {
      setProfileStatus('idle')
      return
    }
    const sig = headerSignature(result.accepted[0].headers)
    const isCurrent = () => !signal?.aborted && result.accepted.some((file) => useUploadStore.getState().files.includes(file))
    try {
      const res = await fetch(`/api/import-profiles?signature=${sig}`, { signal })
      if (res.ok) {
        const json = await res.json()
        if (isCurrent() && json.data) setProfileHit(json.data)
      }
    } catch {
      // Profile lookup is non-critical; continue without a saved mapping.
    } finally {
      if (isCurrent()) setProfileStatus('done')
    }
  }, [addFiles, setProfileHit, setProfileStatus, setErrors])
}
