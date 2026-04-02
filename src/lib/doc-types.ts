export const DOC_TYPES = [
  { key: 'proof_of_income',    label: 'Proof of Income' },
  { key: 'proof_of_residence', label: 'Proof of Residence' },
  { key: 'government_id',      label: 'Government ID' },
  { key: 'bank_statement',     label: 'Bank Statement' },
  { key: 'employment_letter',  label: 'Employment Letter' },
  { key: 'reference_letter',   label: 'Reference Letter' },
  { key: 'other',              label: 'Other' },
] as const

export type DocTypeKey = typeof DOC_TYPES[number]['key']

export function docTypeLabel(key: string, requestLabel?: string | null): string {
  if (key === 'other' && requestLabel) return requestLabel
  return DOC_TYPES.find(d => d.key === key)?.label ?? key
}
