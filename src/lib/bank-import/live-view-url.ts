export function embeddableLiveViewUrl(raw: string): string | null {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (url.origin === 'https://live.browser-use.com') return url.toString()
  if (!['https://cloud.browser-use.com', 'https://cloud.eu.browser-use.com'].includes(url.origin) || url.pathname !== '/live') return null

  const connections = url.searchParams.getAll('wss')
  if (connections.length !== 1 || !connections[0]) return null
  let connection: URL
  try { connection = new URL(connections[0]) } catch { return null }
  if (!['wss:', 'https:'].includes(connection.protocol) || connection.username || connection.password) return null

  // Dashboard /live pages deny cross-origin framing; the standalone viewer uses the same connection.
  url.hostname = 'live.browser-use.com'
  url.pathname = '/'
  url.hash = ''
  return url.toString()
}
