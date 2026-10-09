export function safeFilename(value: string, fallback = 'bank-import.csv'): string {
  const leaf = value.replace(/\\/g, '/').split('/').pop() ?? ''
  const safe = leaf.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '_').trim().slice(0, 120)
  return safe || fallback
}
