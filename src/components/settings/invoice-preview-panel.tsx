interface Props {
  previewUrl: string | null
  updating: boolean
  error: string | null
}

export function InvoicePreviewPanel({ previewUrl, updating, error }: Props) {
  return (
    <aside className="w-full lg:w-[420px] xl:w-[480px] shrink-0 lg:sticky lg:top-6">
      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            Invoice preview
          </span>
          {updating && (
            <span className="text-[10px] text-muted-foreground animate-pulse">Updating…</span>
          )}
        </div>
        <div className="p-4">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full border rounded aspect-[210/297] bg-white"
              title="Invoice preview"
            />
          ) : error ? (
            <div className="aspect-[210/297] w-full border rounded flex items-center justify-center bg-gray-50">
              <p className="text-xs text-muted-foreground">Preview unavailable</p>
            </div>
          ) : (
            <div className="aspect-[210/297] w-full border rounded flex items-center justify-center bg-gray-50">
              <p className="text-xs text-muted-foreground animate-pulse">Generating preview…</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
