export async function fetchImageAsDataUri(
  url: string,
  timeoutMs = 4000,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    const mime = contentType.split(';')[0].trim()
    if (mime !== 'image/png' && mime !== 'image/jpeg') {
      return null
    }

    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
