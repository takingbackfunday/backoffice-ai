'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Bookmark } from 'lucide-react'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { usePortalOutsideClick } from '@/hooks/use-portal-outside-click'

interface ServiceItem {
  id: string
  description: string
  unit: string | null
  defaultRate: number
  defaultCostRate: number | null
  tags: string[]
  usageCount: number
}

interface Props {
  onSelect: (item: ServiceItem) => void
  anchorClassName?: string
}

export function ServiceItemPicker({ onSelect, anchorClassName }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  usePortalOutsideClick(containerRef, () => setOpen(false), { enabled: open })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/service-items')
      const json = await res.json()
      if (json.data) setItems(json.data)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchItems()
  }, [open, fetchItems])

  function handleSelect(item: ServiceItem) {
    onSelect(item)
    setOpen(false)
    // Fire-and-forget usage increment
    fetch(`/api/service-items/${item.id}/use`, { method: 'POST' }).catch(() => {})
  }

  return (
    <div ref={containerRef}>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={anchorClassName ?? 'flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'}
      >
        <Plus className="w-3 h-3" /> From library
      </button>

      <PortalDropdown
        anchorRef={anchorRef}
        open={open}
        align="left"
        className="w-80 rounded-xl border bg-background shadow-xl overflow-hidden"
      >
        <div className="p-2 border-b flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Service library</span>
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-72 overflow-y-auto">
          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-6 text-center">
              No saved service items yet.
            </p>
          )}
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b last:border-b-0"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {item.unit ?? 'x'} · {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.defaultRate)}
                    </span>
                    {item.defaultCostRate != null && (
                      <span className="text-xs text-muted-foreground">
                        cost {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.defaultCostRate)}
                      </span>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {item.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Bookmark className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </div>
            </button>
          ))}
        </div>

        <div className="border-t px-3 py-2 bg-muted/20">
          <Link
            href="/settings#service-library"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline"
          >
            Manage library →
          </Link>
        </div>
      </PortalDropdown>
    </div>
  )
}
