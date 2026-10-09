import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetUploadDropzone, useUploadDropzoneStore, type PendingSheetPick } from './upload-dropzone-store'

beforeEach(() => resetUploadDropzone())
afterEach(() => resetUploadDropzone())

describe('upload dropzone reset', () => {
  it('monotonically increments resetVersion through both reset entry points', () => {
    const initialVersion = useUploadDropzoneStore.getState().resetVersion

    resetUploadDropzone()
    expect(useUploadDropzoneStore.getState().resetVersion).toBe(initialVersion + 1)
    useUploadDropzoneStore.getState().reset()
    expect(useUploadDropzoneStore.getState().resetVersion).toBe(initialVersion + 2)
    resetUploadDropzone()
    expect(useUploadDropzoneStore.getState().resetVersion).toBe(initialVersion + 3)
  })

  it('clears busy state, errors, pending sheets, and choices while invalidating the previous version', () => {
    const pick: PendingSheetPick = {
      id: 'sheet-pick', filename: 'statement.xlsx', originalFile: new File(['workbook'], 'statement.xlsx'),
      workbook: { SheetNames: ['Transactions'], Sheets: { Transactions: {} } },
      sheets: [{ name: 'Transactions', rowCount: 2 }],
    }
    const store = useUploadDropzoneStore.getState()
    store.setBusy(true)
    store.setBusyNotice(true)
    store.setProcessing('excel')
    store.setErrors([{ filename: 'bad.csv', reason: 'Unreadable' }])
    store.addPendingPicks([pick])
    store.setSheetChoice(pick.id, 'Transactions')
    const version = useUploadDropzoneStore.getState().resetVersion
    expect(useUploadDropzoneStore.getState()).toMatchObject({ busy: true, pendingPicks: [pick], sheetChoice: { 'sheet-pick': 'Transactions' } })

    resetUploadDropzone()

    expect(useUploadDropzoneStore.getState()).toMatchObject({
      resetVersion: version + 1,
      busy: false, busyNotice: false, processing: null, errors: [], pendingPicks: [], sheetChoice: {},
    })
  })
})
