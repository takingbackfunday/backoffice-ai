import { analyzeCsv } from '@/lib/csv-structure'
import { listWorkbookSheets, readWorkbook, workbookSheetToCsv } from '@/lib/excel'
import type { UploadFile } from '@/types'

export interface ArtifactConversion {
  file: UploadFile | null
  unsupportedReason?: string
}

export function artifactToUploadFile(
  artifact: { filename: string; mimeType: string; bytes: Uint8Array },
  context: { bankName: string; dateFrom: string; dateTo: string },
): ArtifactConversion {
  const filename = artifact.filename.toLowerCase()
  if (filename.endsWith('.csv') || filename.endsWith('.txt') || artifact.mimeType === 'text/csv' || artifact.mimeType === 'text/plain') {
    let text = new TextDecoder('utf-8').decode(artifact.bytes).replace(/^\uFEFF/, '')
    if ((text.match(/\uFFFD/g)?.length ?? 0) > 3) {
      text = new TextDecoder('windows-1252').decode(artifact.bytes).replace(/^\uFEFF/, '')
    }
    return csvUploadFile(text, context)
  }

  if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || artifact.mimeType.includes('spreadsheetml') || artifact.mimeType === 'application/vnd.ms-excel') {
    try {
      const workbook = readWorkbook(artifact.bytes)
      const sheet = listWorkbookSheets(workbook)[0]
      if (!sheet) return { file: null, unsupportedReason: 'The workbook has no non-empty sheets.' }
      return csvUploadFile(workbookSheetToCsv(workbook, sheet.name), context, 'excel')
    } catch {
      return { file: null, unsupportedReason: 'Could not read the spreadsheet export.' }
    }
  }

  return { file: null, unsupportedReason: 'PDF statements are not supported here. Download the file and use Upload file instead.' }
}

function csvUploadFile(csvText: string, context: { bankName: string; dateFrom: string; dateTo: string }, source: UploadFile['source'] = 'csv'): ArtifactConversion {
  const structure = analyzeCsv(csvText)
  const headers = [...new Set(structure.headers.map((header) => header.trim()).filter(Boolean))]
  if (structure.headerless || headers.length === 0) return { file: null, unsupportedReason: "Couldn't read the file's header row." }
  return {
    file: {
      filename: `${context.bankName} ${context.dateFrom} to ${context.dateTo}.csv`,
      headers,
      csvText,
      source,
    },
  }
}
