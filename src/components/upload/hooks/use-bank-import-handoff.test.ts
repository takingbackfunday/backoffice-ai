import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadStore } from '@/stores/upload-store'
import { resetUploadDropzone } from '@/stores/upload-dropzone-store'
import type { UploadFile } from '@/types'
import { useBankImportHandoff as readHandoff } from './use-bank-import-handoff'

const hooks = vi.hoisted(() => {
  const states: unknown[] = []
  const refs: { current: unknown }[] = []
  const effects: { deps: readonly unknown[]; cleanup?: (() => void) | void }[] = []
  let stateIndex = 0
  let refIndex = 0
  let effectIndex = 0
  let pendingEffects: (() => void)[] = []

  return {
    beginRender() { stateIndex = 0; refIndex = 0; effectIndex = 0 },
    flushEffects() {
      const pending = pendingEffects
      pendingEffects = []
      // Effects see the captured render values, even when an earlier effect resets the store.
      for (const effect of pending) effect()
    },
    unmount() { for (const effect of effects) effect.cleanup?.() },
    reset() { states.length = 0; refs.length = 0; effects.length = 0; pendingEffects = [] },
    useState<T>(initial: T): [T, (value: T) => void] {
      const index = stateIndex++
      if (index >= states.length) states[index] = initial
      return [states[index] as T, (value) => { states[index] = value }]
    },
    useRef<T>(initial: T) {
      const index = refIndex++
      if (index >= refs.length) refs[index] = { current: initial }
      return refs[index] as { current: T }
    },
    useEffect(effect: () => (() => void) | void, deps: readonly unknown[]) {
      const index = effectIndex++
      const previous = effects[index]
      if (previous && previous.deps.length === deps.length && deps.every((value, i) => Object.is(value, previous.deps[i]))) return
      const next = { deps, cleanup: undefined as (() => void) | void }
      effects[index] = next
      pendingEffects.push(() => { previous?.cleanup?.(); next.cleanup = effect() })
    },
  }
})

const mocks = vi.hoisted(() => ({
  ingest: vi.fn<(files: UploadFile[], errors: { filename: string; reason: string }[], signal?: AbortSignal) => Promise<void>>(),
}))

vi.mock('react', () => ({
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: hooks.useEffect,
}))
vi.mock('./use-ingest-files', () => ({ useIngestFiles: () => mocks.ingest }))
vi.mock('@/stores/upload-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/upload-store')>()
  const store = actual.useUploadStore
  return {
    useUploadStore: Object.assign(<T>(selector: (state: ReturnType<typeof store.getState>) => T) => selector(store.getState()), store),
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function filesResponse(sessionId: string, count = 1) {
  return new Response(JSON.stringify({
    data: {
      accountId: `account-${sessionId}`,
      bankName: 'Test Bank',
      files: Array.from({ length: count }, (_, index) => ({
        filename: `${sessionId}-${index + 1}.csv`,
        headers: ['Date', 'Description', 'Amount'],
        csvText: 'Date,Description,Amount\n2026-01-01,Coffee,-4.50',
        source: 'csv',
      })),
      unsupported: [],
    },
  }))
}

function render(sessionId: string | null) {
  hooks.beginRender()
  const result = readHandoff(sessionId)
  hooks.flushEffects()
  return result
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  hooks.reset()
  useUploadStore.getState().reset()
  resetUploadDropzone()
  mocks.ingest.mockReset().mockImplementation(async (files) => { useUploadStore.getState().addFiles(files) })
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  hooks.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useUploadStore.setState(useUploadStore.getInitialState(), true)
  resetUploadDropzone()
})

describe('useBankImportHandoff lifecycle', () => {
  it('completes an actually loaded session exactly once and only after import', async () => {
    fetchMock.mockResolvedValueOnce(filesResponse('A'))
    render('A')
    await vi.waitFor(() => expect(render('A').state).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/bank-import/sessions/A/files', {
      signal: expect.any(AbortSignal), cache: 'no-store',
    })

    const imported = { imported: 2, skipped: 1, unreadable: 0, jobIds: [] }
    useUploadStore.getState().setLastImport(imported)
    render('A')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/bank-import/sessions/A/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imported: 2, skipped: 1 }),
    })
    useUploadStore.getState().setLastImport({ ...imported })
    render('A')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not complete session B with A counts on the stale ready render when the session changes', async () => {
    const sessionB = deferred<Response>()
    fetchMock.mockResolvedValueOnce(filesResponse('A'))
      .mockResolvedValueOnce(new Response('{}'))
      .mockReturnValueOnce(sessionB.promise)
    render('A')
    await vi.waitFor(() => expect(render('A').state).toBe('ready'))
    useUploadStore.getState().setLastImport({ imported: 2, skipped: 0, unreadable: 0, jobIds: [] })
    render('A')

    expect(render('B').state).toBe('ready')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/bank-import/sessions/A/files',
      '/api/bank-import/sessions/A/complete',
      '/api/bank-import/sessions/B/files',
    ])
    expect(useUploadStore.getState().lastImport).toBeNull()
    sessionB.resolve(filesResponse('B'))
    await vi.waitFor(() => expect(render('B').state).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledTimes(3)

    useUploadStore.getState().setLastImport({ imported: 7, skipped: 3, unreadable: 0, jobIds: [] })
    render('B')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/bank-import/sessions/B/complete', expect.objectContaining({
      body: JSON.stringify({ imported: 7, skipped: 3 }),
    }))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not restore the bank account or become ready after reset during ingestion', async () => {
    const ingestion = deferred<void>()
    mocks.ingest.mockImplementation((files) => {
      useUploadStore.getState().addFiles(files)
      return ingestion.promise
    })
    fetchMock.mockResolvedValueOnce(filesResponse('A'))
    const setAccountId = vi.spyOn(useUploadStore.getState(), 'setAccountId')
    render('A')
    await vi.waitFor(() => expect(mocks.ingest).toHaveBeenCalledTimes(1))
    expect(useUploadStore.getState().accountId).toBe('account-A')
    const replacement = { ...useUploadStore.getState().files[0] }
    useUploadStore.getState().reset()
    useUploadStore.getState().addFiles([replacement])
    useUploadStore.getState().setAccountId('replacement-account')
    setAccountId.mockClear()

    ingestion.resolve()
    await vi.waitFor(() => expect(render('A').state).toBe('idle'))

    expect(setAccountId).not.toHaveBeenCalled()
    expect(useUploadStore.getState().accountId).toBe('replacement-account')
    expect(useUploadStore.getState().files[0]).toBe(replacement)
    useUploadStore.getState().setLastImport({ imported: 1, skipped: 0, unreadable: 0, jobIds: [] })
    render('A')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops a delayed files response immediately on discard before route cleanup', async () => {
    const files = deferred<Response>()
    fetchMock.mockReturnValueOnce(files.promise)
    const handoff = render('A')
    const signal = fetchMock.mock.calls[0][1]?.signal

    handoff.reset()
    useUploadStore.getState().reset()
    resetUploadDropzone()
    expect(signal?.aborted).toBe(true)
    expect(render('A').state).toBe('idle')

    // Simulate an already-arriving response that does not respect fetch abortion.
    files.resolve(filesResponse('A'))
    await files.promise
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.ingest).not.toHaveBeenCalled()
    expect(useUploadStore.getState().files).toEqual([])
    expect(useUploadStore.getState().accountId).toBeNull()
    expect(render('A').state).toBe('idle')
  })

  it('aborts pending ingestion and does not complete a discarded session with later manual counts', async () => {
    const ingestion = deferred<void>()
    mocks.ingest.mockImplementation((files) => {
      useUploadStore.getState().addFiles(files)
      return ingestion.promise
    })
    fetchMock.mockResolvedValueOnce(filesResponse('A'))
    render('A')
    await vi.waitFor(() => expect(mocks.ingest).toHaveBeenCalledTimes(1))
    const signal = mocks.ingest.mock.calls[0][2]

    render('A').reset()
    useUploadStore.getState().reset()
    resetUploadDropzone()
    useUploadStore.getState().setAccountId('manual-account')
    expect(signal?.aborted).toBe(true)
    ingestion.resolve()
    await ingestion.promise

    expect(render('A').state).toBe('idle')
    expect(useUploadStore.getState().accountId).toBe('manual-account')
    useUploadStore.getState().setLastImport({ imported: 1, skipped: 0, unreadable: 0, jobIds: [] })
    render('A')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('can load another bank session after discarding the first', async () => {
    fetchMock.mockResolvedValueOnce(filesResponse('A')).mockResolvedValueOnce(filesResponse('B'))
    render('A')
    await vi.waitFor(() => expect(render('A').state).toBe('ready'))
    render('A').reset()
    render(null)
    render('B')
    await vi.waitFor(() => expect(render('B').state).toBe('ready'))
    expect(useUploadStore.getState().accountId).toBe('account-B')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts the old ingestion on a session change and ignores its late account/ready writes', async () => {
    const ingestion = deferred<void>()
    const sessionB = deferred<Response>()
    mocks.ingest.mockImplementationOnce((files) => {
      useUploadStore.getState().addFiles(files)
      return ingestion.promise
    })
    fetchMock.mockResolvedValueOnce(filesResponse('A')).mockReturnValueOnce(sessionB.promise)
    render('A')
    await vi.waitFor(() => expect(mocks.ingest).toHaveBeenCalledTimes(1))
    const oldSignal = mocks.ingest.mock.calls[0][2]
    render('B')
    expect(oldSignal?.aborted).toBe(true)
    useUploadStore.getState().setAccountId('new-selection')
    const setAccountId = vi.spyOn(useUploadStore.getState(), 'setAccountId')

    ingestion.resolve()
    await ingestion.promise
    expect(render('B').state).toBe('loading')
    expect(setAccountId).not.toHaveBeenCalled()
    expect(useUploadStore.getState().accountId).toBe('new-selection')

    sessionB.resolve(filesResponse('B'))
    await vi.waitFor(() => expect(render('B').state).toBe('ready'))
    expect(useUploadStore.getState().accountId).toBe('account-B')
  })

  it('becomes ready if the first file is removed but another ingested file remains', async () => {
    const ingestion = deferred<void>()
    mocks.ingest.mockImplementation((files) => {
      useUploadStore.getState().addFiles(files)
      return ingestion.promise
    })
    fetchMock.mockResolvedValueOnce(filesResponse('A', 2))
    render('A')
    await vi.waitFor(() => expect(mocks.ingest).toHaveBeenCalledTimes(1))
    const [first, second] = useUploadStore.getState().files
    useUploadStore.getState().removeFile(first.filename)

    ingestion.resolve()
    await vi.waitFor(() => expect(render('A').state).toBe('ready'))

    expect(useUploadStore.getState().files[0]).toBe(second)
    expect(useUploadStore.getState().accountId).toBe('account-A')
  })
})
