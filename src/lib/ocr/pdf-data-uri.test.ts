import { describe, expect, it } from 'vitest'
import { decodePdfDataUri } from './pdf-data-uri'

const pdfPayload = Buffer.from('%PDF-1.7 test').toString('base64')

describe('decodePdfDataUri', () => {
  it('accepts application/pdf and returns a normalised data URI', () => {
    const result = decodePdfDataUri(`data:application/pdf;base64,${pdfPayload}`)
    expect(result).not.toBeNull()
    expect(result?.dataUri).toMatch(/^data:application\/pdf;base64,/)
  })

  it('accepts other declared MIME types when the bytes are a PDF', () => {
    expect(decodePdfDataUri(`data:application/octet-stream;base64,${pdfPayload}`)).not.toBeNull()
  })

  it('rejects non-PDF bytes', () => {
    const payload = Buffer.from('hello world').toString('base64')
    expect(decodePdfDataUri(`data:application/pdf;base64,${payload}`)).toBeNull()
  })

  it('rejects malformed data URIs', () => {
    expect(decodePdfDataUri('not a data uri')).toBeNull()
  })
})
