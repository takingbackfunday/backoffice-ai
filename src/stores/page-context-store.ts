import { create } from 'zustand'
import type { PageContext } from '@/lib/agent/page-context'

interface PageContextStore {
  context: PageContext | null
  setContext: (ctx: PageContext | null) => void
}

export const usePageContextStore = create<PageContextStore>((set) => ({
  context: null,
  setContext: (context) => set({ context }),
}))
