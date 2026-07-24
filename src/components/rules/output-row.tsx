'use client'

import type { Workspace } from '@/generated/prisma/client'
import { CategoryCombobox } from '@/components/ui/category-combobox'
import { PayeeCombobox } from '@/components/ui/payee-combobox'
import {
  OUTPUT_TYPE_LABELS,
  type CategoryGroup, type OutputAction, type OutputActionType, type Payee,
} from './rule-types'

const OUTPUT_STYLES: Record<OutputActionType, { bg: string; label: string; text: string; value: string }> = {
  category: { bg: 'bg-[#EEEDFE]', label: 'text-[#534AB7]/80', text: 'text-[#3C3489]', value: 'font-medium' },
  payee:    { bg: 'bg-[#E1F5EE]', label: 'text-[#0F6E56]/80', text: 'text-[#085041]', value: 'font-medium' },
  project:  { bg: 'bg-[#FEF3E2]', label: 'text-[#92540A]/80', text: 'text-[#6B3A08]', value: 'font-medium' },
  notes:    { bg: 'bg-[#F0F0F0]', label: 'text-[#555]/80',    text: 'text-[#333]',    value: 'font-medium' },
}

const OUTPUT_LABELS: Record<OutputActionType, string> = {
  category: 'Category',
  payee:    'Payee',
  project:  'Workspace',
  notes:    'Notes',
}

export function OutputRow({
  action, projects, payees, categoryGroups, onChange, onRemove, canRemove, onPayeeCreated,
}: {
  action: OutputAction; projects: Workspace[]; payees: Payee[]; categoryGroups: CategoryGroup[]
  onChange: (a: OutputAction) => void; onRemove: () => void; canRemove: boolean
  onPayeeCreated?: (p: Payee) => void
}) {
  const s = OUTPUT_STYLES[action.type]
  const pillInput = `bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none flex-1 min-w-0`

  return (
    <div className={`flex items-center gap-1.5 ${s.bg} rounded px-2 py-1`}>
      <span className={`text-[10px] ${s.label} shrink-0 w-12`}>{OUTPUT_LABELS[action.type]}</span>
      {action.type === 'project' ? (
        <select value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          className={`bg-transparent text-[13px] ${s.text} ${s.value} border-none outline-none cursor-pointer flex-1`}
          aria-label="Workspace">
          <option value="">— None —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : action.type === 'payee' ? (
        <PayeeCombobox
          value={action.value || null}
          payees={payees}
          initialQuery={action.value ? undefined : action.label}
          onCommit={(id) => onChange({ type: action.type, value: id ?? '', label: undefined })}
          onDraftChange={(d) => onChange({ ...action, label: d })}
          onPayeeCreated={onPayeeCreated}
          placeholder="Search or + create payee…"
          inputClassName={pillInput}
          listClassName="rounded border border-black/10 bg-white shadow-md text-xs max-h-44 overflow-y-auto"
        />
      ) : action.type === 'notes' ? (
        <input type="text" value={action.value}
          onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="Note to set on matching transactions…"
          className={pillInput}
          aria-label="Notes value" />
      ) : categoryGroups.length > 0 ? (
        <CategoryCombobox
          value={action.value || null}
          groups={categoryGroups}
          onCommit={(id) => onChange({ ...action, value: id ?? '' })}
          placeholder="Search categories…"
          inputClassName={pillInput}
        />
      ) : (
        <input type="text" value={action.value} onChange={(e) => onChange({ ...action, value: e.target.value })}
          placeholder="e.g. Rent & Utilities"
          className={pillInput}
          aria-label={OUTPUT_TYPE_LABELS[action.type]} />
      )}
      {canRemove && (
        <button type="button" onClick={onRemove}
          className="text-[#bbb] hover:text-red-500 text-base leading-none px-0.5 shrink-0"
          aria-label={`Remove ${OUTPUT_LABELS[action.type]}`}>×</button>
      )}
    </div>
  )
}
