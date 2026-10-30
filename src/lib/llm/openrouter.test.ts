import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEEPSEEK_MODEL, openrouterChat, openrouterImageChat, openrouterPdfChat, openrouterWithTools } from './openrouter'

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

describe('openrouterImageChat', () => {
  it('sends an image URL to the vision model and returns usage', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"vendor":"Cafe"}' } }],
      usage: { prompt_tokens: 300, completion_tokens: 12 },
    }), { status: 200 }))

    const result = await openrouterImageChat('Read this receipt', 'data:image/jpeg;base64,/9j/4AAQ', {
      model: 'anthropic/claude-sonnet-4.6',
      responseFormat: { type: 'json_object' },
    })

    expect(result).toEqual({
      content: '{"vendor":"Cafe"}',
      usage: { inputTokens: 300, outputTokens: 12 },
    })

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string
      messages: { role: string; content: unknown }[]
      response_format: unknown
    }
    expect(request.model).toBe('anthropic/claude-sonnet-4.6')
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.messages[0]).toEqual({ role: 'system', content: 'Read this receipt' })
    expect(request.messages[1].content).toEqual([
      { type: 'text', text: 'Extract the receipt data from this image.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' } },
    ])
  })
})

describe('openrouterPdfChat', () => {
  it('sends the PDF to the Mistral OCR file parser and returns usage', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"transactions":[]}' } }],
      usage: { prompt_tokens: 120, completion_tokens: 8 },
    }), { status: 200 }))

    const result = await openrouterPdfChat('Extract transactions', 'data:application/pdf;base64,JVBERi0=', {
      model: 'anthropic/claude-sonnet-4.6',
      maxTokens: 4096,
    })

    expect(result).toEqual({
      content: '{"transactions":[]}',
      usage: { inputTokens: 120, outputTokens: 8 },
    })

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string
      messages: { role: string; content: unknown }[]
      plugins: unknown
      response_format: unknown
    }
    expect(request.model).toBe('anthropic/claude-sonnet-4.6')
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }])
    expect(request.messages[0]).toEqual({ role: 'system', content: 'Extract transactions' })
    expect(request.messages[1].content).toEqual([
      { type: 'text', text: 'Extract every transaction from the attached bank statement.' },
      { type: 'file', file: { filename: 'statement.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' } },
    ])
  })

  it('retries a transient PDF request failure', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
      }), { status: 200 }))

    const promise = openrouterPdfChat('Extract transactions', 'data:application/pdf;base64,JVBERi0=')
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual({ content: 'ok', usage: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
