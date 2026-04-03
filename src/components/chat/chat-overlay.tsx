'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Minus, Sparkles } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { AgentQA } from '@/components/dashboard/agent-qa'

export function ChatOverlay() {
  const pathname = usePathname()
  if (pathname.startsWith('/portal') || pathname.startsWith('/apply') || pathname.startsWith('/sign')) return null
  const { open, toggle, close, hidden, hide, show } = useChatStore()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (hidden) {
    return (
      <button
        onClick={show}
        aria-label="Show AI chat"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 rounded-full bg-[#3C3489]/10 text-[#3C3489] border border-[#3C3489]/20 px-3 py-1.5 text-xs font-medium hover:bg-[#3C3489]/15 transition-colors animate-in slide-in-from-bottom-2 fade-in duration-300"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>AI Chat</span>
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Chat with AI about your finances"
          className="fixed bottom-20 right-6 z-50 w-[380px] rounded-xl border bg-white shadow-2xl shadow-black/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          style={{ maxHeight: 'calc(100vh - 6rem)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-[#f9f8ff]">
            <div className="flex items-center gap-2">
              <span className="text-base">💬</span>
              <span className="text-sm font-medium text-[#1a1a1a]">Chat with AI</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={hide}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-black/5"
                aria-label="Hide chat"
                title="Hide chat"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={close}
                className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            <AgentQA />
          </div>
        </div>
      )}

      {/* Floating action button */}
      <button
        onClick={toggle}
        aria-label="Chat with AI about your finances"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#3C3489] text-white shadow-lg shadow-[#3C3489]/30 px-4 py-3 text-sm font-medium hover:bg-[#2d2770] transition-colors"
      >
        <span className="text-base leading-none">{open ? '×' : '💬'}</span>
        {!open && <span>Chat with AI</span>}
      </button>
    </>
  )
}
