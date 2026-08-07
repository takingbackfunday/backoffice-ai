import type { ChatMessage, ToolDefinition } from '@/lib/llm/openrouter'

// ── Conversation Memory ──────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ConversationSession {
  sessionId: string
  turns: ConversationTurn[]
  createdAt: number
}

// ── SSE Events ───────────────────────────────────────────────────

export interface SseEvent {
  type: 'status' | 'token' | 'answer' | 'done' | 'error' | 'session' | 'action' | 'link'
  message?: string
  text?: string
  answer?: string
  error?: string
  sessionId?: string
  turnCount?: number
  // action events
  target?: 'invoice' | 'quote'
  action?: import('./page-context').EditorAction
  // link events
  route?: string
  anchor?: string
  label?: string
  reason?: string
}

// Suppress unused import warning — these types are re-exported for consumers
export type { ChatMessage, ToolDefinition }
