import type { ChatMessage, ToolDefinition } from '@/lib/llm/openrouter'

// ── Domain & Routing ─────────────────────────────────────────────

export type AgentDomain = 'finance' | 'property'

export interface DomainClassification {
  primary: AgentDomain
  secondary: AgentDomain | null
  reasoning: string
}

// ── Conversation Memory ──────────────────────────────────────────

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  domain: AgentDomain | 'cross-domain'
  timestamp: number
}

export interface ConversationSession {
  sessionId: string
  turns: ConversationTurn[]
  createdAt: number
}

export const MAX_TURNS = 3

// ── Agent Interface ──────────────────────────────────────────────

export interface AgentContext {
  userId: string
  question: string
  conversationHistory: ConversationTurn[]
  onStatus: (message: string) => void
}

export interface AgentResult {
  answer: string
  toolsUsed: string[]
  needsHandoff: boolean
  handoffContext?: string
  domain: AgentDomain
}

export interface Agent {
  domain: AgentDomain
  run(ctx: AgentContext): Promise<AgentResult>
}

// ── SSE Events ───────────────────────────────────────────────────

export interface SseEvent {
  type: 'status' | 'answer' | 'done' | 'error' | 'session'
  message?: string
  answer?: string
  error?: string
  sessionId?: string
  turnCount?: number
}

// Suppress unused import warning — these types are re-exported for consumers
export type { ChatMessage, ToolDefinition }
