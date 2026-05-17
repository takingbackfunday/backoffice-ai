import { create } from 'zustand'
import type { ConversationTurn } from '@/lib/agent/types'

const MAX_TURNS = 5

interface ChatStore {
  open: boolean
  toggle: () => void
  close: () => void
  hidden: boolean
  hide: () => void
  show: () => void
  // Open and pre-load a message to auto-submit
  openWithMessage: (message: string) => void
  pendingMessage: string | null
  clearPendingMessage: () => void

  // Conversation memory
  sessionId: string
  turns: ConversationTurn[]
  addTurn: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void
}

function makeSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
  hidden: false,
  hide: () => set({ hidden: true, open: false }),
  show: () => set({ hidden: false }),
  pendingMessage: null,
  openWithMessage: (message) => set({ open: true, pendingMessage: message }),
  clearPendingMessage: () => set({ pendingMessage: null }),

  sessionId: makeSessionId(),
  turns: [],

  addTurn(role, content) {
    set((s) => {
      const next: ConversationTurn = { role, content, timestamp: Date.now() }
      // Keep only the last MAX_TURNS pairs (user+assistant), so 2×MAX_TURNS items total
      const updated = [...s.turns, next].slice(-(MAX_TURNS * 2))
      return { turns: updated }
    })
  },

  clearHistory() {
    set({ turns: [], sessionId: makeSessionId() })
  },
}))
