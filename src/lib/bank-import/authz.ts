import { prisma } from '@/lib/prisma'
import { NotFoundError } from '@/lib/not-found-error'
import { SNAPSHOT_INCLUDE } from './sessions'

export async function requireBankImportSession(userId: string, id: string) {
  const session = await prisma.bankImportSession.findFirst({ where: { id, userId }, include: SNAPSHOT_INCLUDE })
  if (!session) throw new NotFoundError('Import session not found')
  return session
}
