import { create } from 'zustand'
import type { PreviewRow, UploadState } from '@/types'

interface UploadStore extends UploadState {
  csvText: string | null  // raw CSV text, kept for submitting to API
  setStep: (step: UploadState['step']) => void
  setAccountId: (id: string) => void
  setCsvData: (data: { filename: string; headers: string[]; csvText: string }) => void
  setPreviewRows: (rows: PreviewRow[], totalRows: number, duplicateCount: number) => void
  reset: () => void
}

const initialState: UploadState & { csvText: string | null } = {
  step: 'upload',
  accountId: null,
  filename: null,
  csvHeaders: [],
  csvText: null,
  previewRows: [],
  totalRows: 0,
  duplicateCount: 0,
}

export const useUploadStore = create<UploadStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setAccountId: (accountId) => set({ accountId }),

  setCsvData: ({ filename, headers, csvText }) =>
    set({ filename, csvHeaders: headers, csvText, step: 'map-columns' }),

  setPreviewRows: (previewRows, totalRows, duplicateCount) =>
    set({ previewRows, totalRows, duplicateCount, step: 'preview' }),

  reset: () => set(initialState),
}))
