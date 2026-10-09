import { create } from 'zustand'
import type { ExcelSheetInfo, Workbook } from '@/lib/excel'

export interface PendingSheetPick {
  id: string
  filename: string
  originalFile: File
  workbook: Workbook
  sheets: ExcelSheetInfo[]
}

interface DropzoneState {
  errors: { filename: string; reason: string }[]
  pendingPicks: PendingSheetPick[]
  sheetChoice: Record<string, string>
  processing: 'pdf' | 'excel' | 'file' | null
  busy: boolean
  busyNotice: boolean
  resetVersion: number
  setErrors: (errors: { filename: string; reason: string }[]) => void
  addPendingPicks: (picks: PendingSheetPick[]) => void
  removePendingPick: (id: string) => void
  setSheetChoice: (id: string, sheetName: string) => void
  setProcessing: (processing: DropzoneState['processing']) => void
  setBusy: (busy: boolean) => void
  setBusyNotice: (show: boolean) => void
  reset: () => void
}

const initialState = {
  errors: [],
  pendingPicks: [],
  sheetChoice: {},
  processing: null,
  busy: false,
  busyNotice: false,
  resetVersion: 0,
}

export const useUploadDropzoneStore = create<DropzoneState>((set) => ({
  ...initialState,
  setErrors: (errors) => set({ errors }),
  addPendingPicks: (picks) => set((state) => ({
    pendingPicks: [...state.pendingPicks.filter((pick) => !picks.some((next) => next.filename === pick.filename)), ...picks],
    sheetChoice: {
      ...state.sheetChoice,
      ...Object.fromEntries(picks.map((pick) => [pick.id, pick.sheets[0].name])),
    },
  })),
  removePendingPick: (id) => set((state) => ({
    pendingPicks: state.pendingPicks.filter((pick) => pick.id !== id),
  })),
  setSheetChoice: (id, sheetName) => set((state) => ({ sheetChoice: { ...state.sheetChoice, [id]: sheetName } })),
  setProcessing: (processing) => set({ processing }),
  setBusy: (busy) => set({ busy }),
  setBusyNotice: (busyNotice) => set({ busyNotice }),
  reset: () => set((state) => ({ ...initialState, resetVersion: state.resetVersion + 1 })),
}))

export const resetUploadDropzone = () => useUploadDropzoneStore.getState().reset()
