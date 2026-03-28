import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { FileText } from 'lucide-react'
import { getPortalSession } from '@/lib/portal-auth'

const FILE_TYPE_LABELS: Record<string, string> = {
  LEASE_AGREEMENT:   'Lease agreement',
  ID_DOCUMENT:       'ID document',
  PAY_STUB:          'Pay stub',
  CREDIT_REPORT:     'Credit report',
  INSPECTION_REPORT: 'Inspection report',
  MOVE_IN_PHOTOS:    'Move-in photos',
  MOVE_OUT_PHOTOS:   'Move-out photos',
  INSURANCE:         'Insurance',
  OTHER:             'Other',
}

export default async function PortalDocumentsPage() {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')
  const { tenantId } = session

  const files = await prisma.tenantFile.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })

  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Files shared by your landlord.</p>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No documents yet. Your landlord will share files here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <a
              key={f.id}
              href={f.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{f.fileName}</p>
                  <p className="text-xs text-muted-foreground">{FILE_TYPE_LABELS[f.fileType] ?? f.fileType}</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{fmtDate(f.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
