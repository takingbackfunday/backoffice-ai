import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { analyzeCsv } from '@/lib/csv-structure'
import type { CsvMapping } from '@/lib/csv-processor'
import type { ImportProfile, UploadFile } from '@/types'
import type { MappingValidation } from '../col-select'
import { computeAiMappingChanges, type AiMappedField, type AiMappingChange } from '@/lib/ai-mapping-changes'
import { usePendingAiChanges } from '@/hooks/use-pending-ai-changes'

export function useMappingValidation(args: {
  csvHeaders: string[]
  files: UploadFile[]
  source: UploadFile['source']
  profileHit: ImportProfile | null
  profileStatus: 'idle' | 'loading' | 'done'
  mapping: Partial<CsvMapping>
  setMapping: Dispatch<SetStateAction<Partial<CsvMapping>>>
  touchedRef: MutableRefObject<Set<string>>
}): {
  validation: MappingValidation | null
  validating: boolean
  aiPendingFields: ReadonlySet<string>
  aiChanges: AiMappingChange[]
  keepAiChanges: () => void
  undoAiChanges: () => void
  clearAiField: (field: string) => void
} {
  const { csvHeaders, files, source, profileHit, profileStatus, mapping, setMapping, touchedRef } = args
  const [validation, setValidation] = useState<MappingValidation | null>(null)
  const [validating, setValidating] = useState(false)
  const [aiChanges, setAiChanges] = useState<AiMappingChange[]>([])
  const mappingRef = useRef(mapping)
  const { pendingFields, markPending, confirm, undo, clearField } = usePendingAiChanges<Partial<CsvMapping>>()

  useEffect(() => { mappingRef.current = mapping }, [mapping])

  useEffect(() => {
    if (!csvHeaders.length || !files.length || profileHit || profileStatus !== 'done') return
    if (source === 'pdf') return
    const firstFile = files[0]
    if (!firstFile?.csvText) return
    const structure = analyzeCsv(firstFile.csvText)
    const first20 = structure.rows.slice(0, 20).map((fields) => {
      const obj: Record<string, string> = {}
      structure.headers.forEach((h, i) => {
        if (h && !(h in obj)) obj[h] = fields[i] ?? ''
      })
      return obj
    })
    setValidating(true)
    fetch('/api/llm/validate-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: csvHeaders, sampleRows: first20, mapping }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j.error) {
          setValidation(j.data)
          const changes = computeAiMappingChanges(mappingRef.current, j.data, touchedRef.current, csvHeaders)
          if (changes.length > 0) {
            for (const change of changes) markPending(change.field, mappingRef.current)
            setAiChanges(changes)
            setMapping((m) => {
              const next = { ...m }
              for (const change of changes) {
                if (!touchedRef.current.has(change.field)) next[change.field] = change.to
              }
              return next
            })
          }
        }
      })
      .catch(() => {})
      .finally(() => setValidating(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(','), files[0]?.csvText, profileHit, profileStatus])

  return {
    validation,
    validating,
    aiPendingFields: pendingFields,
    aiChanges: aiChanges.filter((change) => pendingFields.has(change.field)),
    keepAiChanges: () => { confirm(); setAiChanges([]) },
    undoAiChanges: () => {
      const fields = [...pendingFields]
      undo((snapshot) => setMapping((m) => {
        const next = { ...m }
        for (const field of fields) next[field as AiMappedField] = snapshot[field as AiMappedField]
        return next
      }))
      setAiChanges([])
    },
    clearAiField: (field) => clearField(field),
  }
}
