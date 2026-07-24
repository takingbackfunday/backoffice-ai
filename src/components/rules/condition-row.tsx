'use client'

import {
  AMOUNT_FIELDS, DATE_FIELDS, FIELD_OPTIONS, OPERATOR_OPTIONS,
  type ConditionDef, type ConditionField, type ConditionOperator, type ConditionOp,
} from './rule-types'

export function ConditionRow({
  cond, index, op, isOnly, onChange, onRemove, onToggleOp, accounts,
}: {
  cond: ConditionDef; index: number; op: ConditionOp; isOnly: boolean
  onChange: (c: ConditionDef) => void; onRemove: () => void; onToggleOp?: () => void
  accounts?: { id: string; name: string }[]
}) {
  const isAmount  = AMOUNT_FIELDS.has(cond.field)
  const isDate    = DATE_FIELDS.has(cond.field)

  const availableOps = OPERATOR_OPTIONS.filter((o) => {
    if (isAmount) return o.forAmount || o.value === 'equals' || o.value === 'not_equals'
    if (isDate)   return !o.forAmount
    return !o.forAmount
  })

  function handleFieldChange(field: ConditionField) {
    const newIsAmount = AMOUNT_FIELDS.has(field)
    const newIsDate   = DATE_FIELDS.has(field)
    const validOps = OPERATOR_OPTIONS.filter((o) => {
      if (newIsAmount) return o.forAmount || o.value === 'equals' || o.value === 'not_equals'
      if (newIsDate)   return !o.forAmount
      return !o.forAmount
    })
    const newOp = validOps.find((o) => o.value === cond.operator) ? cond.operator : validOps[0].value
    onChange({ ...cond, field, operator: newOp })
  }

  // Group field options for the select
  const fieldGroups = ['Transaction', 'Linked', 'Date']

  const inputPlaceholder =
    cond.operator === 'oneOf' || cond.operator === 'includes' || cond.operator === 'excludes'
      ? 'val1, val2…'
      : isAmount ? '0'
      : isDate && cond.field === 'dayOfWeek' ? 'monday'
      : isDate && cond.field === 'month' ? 'YYYY-MM'
      : isDate ? 'YYYY-MM-DD'
      : 'value…'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {index > 0 && (
        <button type="button" onClick={onToggleOp}
          className="text-[10px] font-semibold text-[#0C447C] uppercase tracking-wide px-1 py-0.5 rounded hover:bg-[#d0e6f8] transition-colors shrink-0"
          title="Click to toggle AND / OR">
          {op}
        </button>
      )}
      <div className="flex items-center gap-1.5 bg-[#E6F1FB] rounded px-2 py-1 flex-wrap flex-1 min-w-0">
        <select
          value={cond.field}
          onChange={(e) => handleFieldChange(e.target.value as ConditionField)}
          className="bg-transparent text-[13px] font-medium text-[#185FA5] border-none outline-none cursor-pointer"
          aria-label="Condition field"
        >
          {fieldGroups.map((group) => (
            <optgroup key={group} label={group}>
              {FIELD_OPTIONS.filter((o) => o.group === group).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={cond.operator}
          onChange={(e) => onChange({ ...cond, operator: e.target.value as ConditionOperator })}
          className="bg-transparent text-[12px] text-[#0C447C]/60 border-none outline-none cursor-pointer"
          aria-label="Condition operator"
        >
          {availableOps.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {cond.field === 'accountName' && accounts && accounts.length > 0 ? (
          <select
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            className="bg-white/55 text-[13px] font-medium text-[#0C447C] rounded px-2 py-0.5 border-none outline-none min-w-[120px] w-full cursor-pointer"
            aria-label="Account name"
          >
            <option value="">— select account —</option>
            {accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
          </select>
        ) : (
          <input
            type={isAmount ? 'number' : 'text'}
            value={cond.value}
            onChange={(e) => onChange({ ...cond, value: e.target.value })}
            placeholder={inputPlaceholder}
            className="bg-white/55 text-[13px] font-medium text-[#0C447C] rounded px-2 py-0.5 border-none outline-none min-w-[120px] w-full"
            aria-label="Condition value"
          />
        )}
      </div>
      {!isOnly && (
        <button type="button" onClick={onRemove}
          className="text-[#bbb] hover:text-red-500 text-base leading-none px-1 shrink-0"
          aria-label="Remove condition">×</button>
      )}
    </div>
  )
}
