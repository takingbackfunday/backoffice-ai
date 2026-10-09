export function mimeFromFilename(name: string): string {
  const extension = name.toLowerCase().split('.').pop()
  switch (extension) {
    case 'csv': return 'text/csv'
    case 'txt': return 'text/plain'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls': return 'application/vnd.ms-excel'
    case 'pdf': return 'application/pdf'
    default: return 'application/octet-stream'
  }
}
