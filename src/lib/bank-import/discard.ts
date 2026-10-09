export async function discardBankImportSession(sessionId: string): Promise<void> {
  const message = 'Could not discard the bank download. Please try again.'
  try {
    const response = await fetch(`/api/bank-import/sessions/${encodeURIComponent(sessionId)}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CANCEL' }),
      cache: 'no-store',
    })
    const json = await response.json()
    if (!response.ok || json.error || json.data?.accepted !== true) throw new Error(message)
  } catch {
    throw new Error(message)
  }
}
