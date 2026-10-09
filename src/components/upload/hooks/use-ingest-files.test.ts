import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '@/stores/upload-store'
import { resetUploadDropzone } from '@/stores/upload-dropzone-store'
import type { UploadFile } from '@/types'
import { useIngestFiles as createIngestFiles } from './use-ingest-files'

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
}))
vi.mock('@/stores/upload-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/upload-store')>()
  const store = actual.useUploadStore
  return {
    useUploadStore: Object.assign(<T>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store),
  }
})
vi.mock('@/stores/upload-dropzone-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/upload-dropzone-store')>()
  const store = actual.useUploadDropzoneStore
  return {
    ...actual,
    useUploadDropzoneStore: Object.assign(<T>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store),
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function makeFile(filename: string): UploadFile {
  return {
    filename,
    headers: ['Date', 'Description', 'Amount'],
    csvText: 'Date,Description,Amount\n2026-01-01,Coffee,-4.50',
    source: 'csv',
  }
}

const profile = { id: 'saved-profile', accountId: 'saved-account', mapping: { dateCol: 'Date' } }
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  useUploadStore.getState().reset()
  resetUploadDropzone()
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useUploadStore.setState(useUploadStore.getInitialState(), true)
  resetUploadDropzone()
})

describe('useIngestFiles lifecycle', () => {
  it('does not add files or change profile state when already aborted', async () => {
    const addFiles = vi.spyOn(useUploadStore.getState(), 'addFiles')
    const setProfileHit = vi.spyOn(useUploadStore.getState(), 'setProfileHit')
    const setProfileStatus = vi.spyOn(useUploadStore.getState(), 'setProfileStatus')
    const controller = new AbortController()
    controller.abort()

    await createIngestFiles()([makeFile('aborted.csv')], [], controller.signal)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(addFiles).not.toHaveBeenCalled()
    expect(setProfileHit).not.toHaveBeenCalled()
    expect(setProfileStatus).not.toHaveBeenCalled()
    expect(useUploadStore.getState()).toMatchObject({ files: [], accountId: null, profileStatus: 'idle' })
  })

  it('ignores a late successful profile response after abort, even with files still present', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    const setProfileHit = vi.spyOn(useUploadStore.getState(), 'setProfileHit')
    const setProfileStatus = vi.spyOn(useUploadStore.getState(), 'setProfileStatus')
    const controller = new AbortController()
    const file = makeFile('aborted.csv')
    const pending = createIngestFiles()([file], [], controller.signal)
    expect(setProfileStatus).toHaveBeenCalledWith('loading')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/import-profiles?signature='), { signal: controller.signal })
    setProfileStatus.mockClear()
    useUploadStore.getState().setAccountId('current-account')
    controller.abort()

    response.resolve(new Response(JSON.stringify({ data: profile })))
    await pending

    expect(setProfileHit).not.toHaveBeenCalled()
    expect(setProfileStatus).not.toHaveBeenCalled()
    expect(useUploadStore.getState().files[0]).toBe(file)
    expect(useUploadStore.getState()).toMatchObject({ accountId: 'current-account', profileHit: null, profileStatus: 'loading' })
  })

  it('does not overwrite a replacement upload after reset, even with the same filename and headers', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    const setProfileHit = vi.spyOn(useUploadStore.getState(), 'setProfileHit')
    const setProfileStatus = vi.spyOn(useUploadStore.getState(), 'setProfileStatus')
    const pending = createIngestFiles()([makeFile('statement.csv')], [])
    useUploadStore.getState().reset()
    const replacement = makeFile('statement.csv')
    useUploadStore.getState().addFiles([replacement])
    useUploadStore.getState().setAccountId('replacement-account')
    useUploadStore.getState().setProfileStatus('loading')
    setProfileStatus.mockClear()

    response.resolve(new Response(JSON.stringify({ data: profile })))
    await pending

    expect(setProfileHit).not.toHaveBeenCalled()
    expect(setProfileStatus).not.toHaveBeenCalled()
    expect(useUploadStore.getState().files[0]).toBe(replacement)
    expect(useUploadStore.getState()).toMatchObject({ accountId: 'replacement-account', profileHit: null, profileStatus: 'loading' })
  })

  it.each([null, profile])('finishes lookup with profile %j when the first file is removed but a second accepted file remains', async (data) => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    const first = makeFile('first.csv')
    const second = makeFile('second.csv')
    const pending = createIngestFiles()([first, second], [])
    useUploadStore.getState().removeFile(first.filename)

    response.resolve(new Response(JSON.stringify({ data })))
    await pending

    expect(useUploadStore.getState().files).toEqual([second])
    expect(useUploadStore.getState().files[0]).toBe(second)
    expect(useUploadStore.getState().profileStatus).toBe('done')
    expect(useUploadStore.getState().profileHit).toEqual(data)
    expect(useUploadStore.getState().accountId).toBe(data?.accountId ?? null)
  })

  it('finishes a failed non-critical lookup while accepted files remain current', async () => {
    fetchMock.mockRejectedValue(new Error('Lookup failed'))

    await createIngestFiles()([makeFile('current.csv')], [])

    expect(useUploadStore.getState()).toMatchObject({ profileHit: null, accountId: null, profileStatus: 'done' })
  })
})
