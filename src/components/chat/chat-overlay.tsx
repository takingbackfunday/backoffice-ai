'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { FinanceQA } from '@/components/dashboard/finance-qa'

export function ChatOverlay() {
  const { open, close } = useChatStore()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel — slides up from bottom-right, anchored above the sidebar button */}
      <div
        role="dialog"
        aria-label="Chat with AI about your finances"
        className="fixed bottom-16 left-3 z-50 w-[360px] rounded-xl border bg-white shadow-2xl shadow-black/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        style={{ maxHeight: 'calc(100vh - 5rem)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-[#f9f8ff]">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <span className="text-sm font-medium text-[#1a1a1a]">Chat with AI</span>
          </div>
          <button
            onClick={close}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            aria-label="Close chat"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4">
          <FinanceQA />
        </div>
      </div>
    </>
  )
}
