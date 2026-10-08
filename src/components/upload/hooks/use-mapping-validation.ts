import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { analyzeCsv } from '@/lib/csv-structure'
import type { CsvMapping } from '@/lib/csv-processor'
import type { ImportProfile, UploadFile } from '@/types'
import type { MappingValidation } from '../col-select'

export function useMappingValidation(args: {
  csvHeaders: string[]
  files: UploadFile[]
  source: UploadFile['source']
  profileHit: ImportProfile | null
  profileStatus: 'idle' | 'loading' | 'done'
  mapping: Partial<CsvMapping>
  setMapping: Dispatch<SetStateAction<Partial<CsvMapping>>>
  touchedRef: MutableRefObject<Set<string>>
}): { validation: MappingValidation | null; validating: boolean } {
  const { csvHeaders, files, source, profileHit, profileStatus, mapping, setMapping, touchedRef } = args
  const [validation, setValidation] = useState<MappingValidation | null>(null)
  const [validating, setValidating] = useState(false)

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
          setMapping((m) => {
            const next = { ...m }
            for (const field of ['dateCol', 'amountCol', 'descCol', 'notesCol'] as const) {
              const v = j.data?.[field]
              if (v?.confidence >= 99 && v.col && csvHeaders.includes(v.col) && !touchedRef.current.has(field)) {
                next[field] = v.col
              }
            }
            // amountSign is never auto-applied; see the sign suggestion notice.
            return next
          })
        }
      })
      .catch(() => {})
      .finally(() => setValidating(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders.join(','), files[0]?.csvText, profileHit, profileStatus])

  return { validation, validating }
}
