import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { notFound } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { safeFilename } from '@/lib/bank-import/safe-filename'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1), artifactId: z.string().min(1) })

export const GET = withBankImportFlag(authedRoute<{ id: string; artifactId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    const artifact = await prisma.bankImportArtifact.findFirst({
      where: { id: params.artifactId, sessionId: session.id, purgedAt: null, content: { not: null } },
      select: { filename: true, mimeType: true, content: true },
    })
    if (!artifact?.content) return notFound('Artifact not found or expired')
    const filename = safeFilename(artifact.filename)
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_')
    return new NextResponse(new Uint8Array(artifact.content), {
      headers: {
        'Content-Type': artifact.mimeType,
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
      },
    })
  },
}))
