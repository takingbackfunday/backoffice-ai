/** Redact long digit runs (account/card numbers) before sending page text to an LLM. Keeps the last 4. */
export function redactDigits(text: string): string {
  return text.replace(/\d[\d\s-]{6,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '')
    return digits.length >= 8 ? `••••${digits.slice(-4)}` : m
  })
}
