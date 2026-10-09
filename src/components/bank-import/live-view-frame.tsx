'use client'

export function LiveViewFrame({ url, interactive }: { url: string | null; interactive: boolean }) {
  if (!url) {
    return <div className="flex aspect-[16/10] items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">Starting secure bank browser…</div>
  }
  return (
    <div className="space-y-2">
      {interactive && <p className="text-xs text-muted-foreground">Click inside the window to sign in or complete verification.</p>}
      <div className={`overflow-hidden rounded-md border border-border bg-muted ${interactive ? '' : 'pointer-events-none opacity-80'}`} inert={!interactive}>
        <iframe
          src={url}
          title="Bank browser"
          allow="autoplay; clipboard-read; clipboard-write"
          tabIndex={interactive ? 0 : -1}
          className="aspect-[16/10] w-full border-0"
        />
      </div>
    </div>
  )
}
