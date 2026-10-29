import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEEPSEEK_MODEL, openrouterChat, openrouterWithTools } from './openrouter'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('OpenRouter default model', () => {
  it('uses DeepSeek V4.1 Flash 1017 for plain chat by default', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))

    await expect(openrouterChat([{ role: 'user', content: 'hello' }])).resolves.toBe('ok')

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { model: string }
    expect(request.model).toBe(DEEPSEEK_MODEL)
  })

  it('uses DeepSeek V4.1 Flash 1017 for tool-capable chat by default', async () => {
    const stream = [
      { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
      { usage: { prompt_tokens: 2, completion_tokens: 1 } },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }))

    const response = await openrouterWithTools([{ role: 'user', content: 'hello' }], [], DEEPSEEK_MODEL, { responseFormat: { type: 'json_object' } })

    expect(response.content).toBe('ok')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      model: DEEPSEEK_MODEL,
      stream: true,
      response_format: { type: 'json_object' },
    })
  })
})

describe('openrouterChat transient retries', () => {
  it('retries a rate-limited (429) response', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))

    const promise = openrouterChat([{ role: 'user', content: 'hello' }])
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-transient error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad request', { status: 400 }))

    await expect(openrouterChat([{ role: 'user', content: 'hello' }])).rejects.toThrow('OpenRouter 400')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
