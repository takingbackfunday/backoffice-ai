'use client'

interface Props {
  name: string
  onNameChange: (v: string) => void
  specialty: string
  onSpecialtyChange: (v: string) => void
  saving: boolean
  onCreate: () => void
  onCancel: () => void
}

export function VendorCreateInline({ name, onNameChange, specialty, onSpecialtyChange, saving, onCreate, onCancel }: Props) {
  return (
    <div className="space-y-1 flex-1">
      <input
        autoFocus
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Vendor name *"
        className="w-full rounded border px-2 py-1 text-xs bg-background"
      />
      <input
        value={specialty}
        onChange={e => onSpecialtyChange(e.target.value)}
        placeholder="Specialty (optional)"
        className="w-full rounded border px-2 py-1 text-xs bg-background"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCreate}
          disabled={saving || !name.trim()}
          className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create vendor'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  )
}
