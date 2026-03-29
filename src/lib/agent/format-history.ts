import type { ConversationTurn } from './types'

export function formatHistory(turns: ConversationTurn[]): string {
  if (!turns.length) return '(no prior conversation)'
  return turns
    .map(t => `[${t.role.toUpperCase()} — ${t.domain}]: ${t.content.slice(0, 500)}`)
    .join('\n')
}
