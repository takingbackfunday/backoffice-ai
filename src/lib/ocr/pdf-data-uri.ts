/**
 * Decode a base64 data URI and confirm the bytes are a PDF (magic "%PDF-").
 * Accepts any declared MIME type (some OSes report application/octet-stream).
 * Returns the buffer plus a normalised application/pdf data URI, or null.
 */
export function decodePdfDataUri(uri: string): { buffer: Buffer; dataUri: string } | null {
  const m = uri.match(/^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  const buffer = Buffer.from(m[1], 'base64')
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return null
  return { buffer, dataUri: `data:application/pdf;base64,${m[1]}` }
}
