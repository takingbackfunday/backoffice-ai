import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { conflict, notFound, ok } from '@/lib/api-response'
import { artifactToUploadFile } from '@/lib/bank-import/artifact-to-upload-file'
import { getBank } from '@/lib/bank-import/banks'
import { safeFilename } from '@/lib/bank-import/safe-filename'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })

export const GET = withBankImportFlag(authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    if (session.status !== 'CAPTURED') return conflict('Download is not ready to review')
    const artifacts = await prisma.bankImportArtifact.findMany({
      where: { sessionId: session.id, purgedAt: null, content: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true, mimeType: true, content: true },
    })
    const bankName = getBank(session.bankKey)?.displayName ?? session.bankKey
    const files = []
    const unsupported: { artifactId: string; filename: string; reason: string }[] = []
    for (const artifact of artifacts) {
      if (!artifact.content) continue
      const result = artifactToUploadFile({ filename: artifact.filename, mimeType: artifact.mimeType, bytes: artifact.content }, {
        bankName,
        dateFrom: session.dateFrom,
        dateTo: session.dateTo,
      })
      if (result.file) files.push(result.file)
      else unsupported.push({ artifactId: artifact.id, filename: safeFilename(artifact.filename), reason: result.unsupportedReason ?? 'Unsupported bank export.' })
    }
    return ok({ accountId: session.accountId, bankName, dateFrom: session.dateFrom, dateTo: session.dateTo, files, unsupported })
  },
}))
