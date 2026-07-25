import { create } from 'zustand'
import type { PreviewRow, UploadState, UploadFile, ImportProfile, FilePreviewMeta } from '@/types'
import { addFiles as addFilesLogic } from '@/lib/session-files'
import { headerSignature } from '@/lib/import-signature'

interface AddFilesResponse {
  accepted: UploadFile[]
  rejected: { filename: string; reason: string }[]
}

interface UploadStore extends UploadState {
  addFiles: (files: UploadFile[]) => AddFilesResponse
  removeFile: (filename: string) => void
  setProfileHit: (profile: ImportProfile | null) => void
  clearProfileHit: () => void
  setStep: (step: UploadState['step']) => void
  setAccountId: (id: string) => void
  setPreviewRows: (rows: PreviewRow[], totalRows: number, duplicateCount: number, perFile?: FilePreviewMeta[]) => void
  reset: () => void
}

const initialState: UploadState = {
  step: 'upload',
  accountId: null,
  files: [],
  signature: null,
  profileHit: null,
  previewRows: [],
  totalRows: 0,
  duplicateCount: 0,
  perFile: [],
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  ...initialState,

  addFiles: (incoming) => {
    const state = get()
    const result = addFilesLogic(state.files, state.signature, incoming)

    if (result.accepted.length === 0) return result

    const allFiles = [...state.files, ...result.accepted]
    const signature = state.signature ?? headerSignature(result.accepted[0].headers)

    set({
      files: allFiles,
      signature,
      step: 'map-columns',
      previewRows: [],
      totalRows: 0,
      duplicateCount: 0,
      perFile: [],
    })

    return result
  },

  removeFile: (filename) => {
    const state = get()
    const files = state.files.filter((f) => f.filename !== filename)
    if (files.length === 0) {
      set({ ...initialState })
    } else {
      set({ files, previewRows: [], totalRows: 0, duplicateCount: 0, perFile: [] })
    }
  },

  setProfileHit: (profileHit) => {
    set({ profileHit })
    if (profileHit?.accountId) {
      set({ accountId: profileHit.accountId })
    }
  },

  clearProfileHit: () => set({ profileHit: null }),

  setStep: (step) => set({ step }),

  setAccountId: (accountId) => set({ accountId }),

  setPreviewRows: (previewRows, totalRows, duplicateCount, perFile = []) =>
    set({ previewRows, totalRows, duplicateCount, perFile, step: 'preview' }),

  reset: () => set(initialState),
}))
