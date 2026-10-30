import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractReceiptDataFromImage } from '@/lib/ocr/extract-receipt'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('extractReceiptDataFromImage', () => {
  it('reads a receipt image through OpenRouter and parses the JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            vendor: 'Corner Cafe',
            vendorAddress: null,
            date: '2026-10-30',
            currency: 'EUR',
            subtotal: 10,
            tax: 2,
            tip: null,
            total: 12,
            paymentMethod: 'visa',
            items: [{ name: 'Coffee', quantity: 1, unitPrice: 10, totalPrice: 10 }],
            rawCategory: 'dining',
          }),
        },
      }],
    }), { status: 200 }))

    const result = await extractReceiptDataFromImage('data:image/jpeg;base64,/9j/4AAQ')

    expect(result.vendor).toBe('Corner Cafe')
    expect(result.total).toBe(12)
    expect(result.items).toHaveLength(1)

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      model: string
      messages: { role: string; content: unknown }[]
    }
    expect(request.model).toBe('anthropic/claude-sonnet-4.6')
    expect(request.messages[1].content).toEqual([
      { type: 'text', text: 'Extract the receipt data from this image.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' } },
    ])
  })

  it('returns an empty structure when the model response is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: 'not json' } }],
    }), { status: 200 }))

    await expect(extractReceiptDataFromImage('https://example.com/receipt.webp')).resolves.toEqual({
      vendor: null,
      vendorAddress: null,
      date: null,
      currency: null,
      subtotal: null,
      tax: null,
      tip: null,
      total: null,
      paymentMethod: null,
      items: [],
      rawCategory: null,
    })
  })
})
