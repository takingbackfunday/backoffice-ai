import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { created, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; estId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, estId } = await params

    const estimate = await prisma.estimate.findFirst({
      where: { id: estId, workspaceId: id, workspace: { userId } },
      include: { sections: { include: { items: true } } },
    })
    if (!estimate) return notFound('Estimate not found')
    if (estimate.status !== 'FINAL') return badRequest('Only finalized estimates can be revised')

    await prisma.estimate.update({ where: { id: estId }, data: { status: 'SUPERSEDED' } })

    const revision = await prisma.estimate.create({
      data: {
        workspaceId: id,
        title: estimate.title,
        currency: estimate.currency,
        notes: estimate.notes,
        version: estimate.version + 1,
        parentId: estId,
        sections: {
          create: estimate.sections.map((s, si) => ({
            name: s.name,
            sortOrder: s.sortOrder ?? si,
            items: {
              create: s.items.map((item, ii) => ({
                description: item.description,
                hours: item.hours,
                costRate: item.costRate,
                quantity: item.quantity,
                unit: item.unit,
                tags: item.tags,
                isOptional: item.isOptional,
                internalNotes: item.internalNotes,
                riskLevel: item.riskLevel,
                sortOrder: item.sortOrder ?? ii,
              })),
            },
          })),
        },
      },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    })

    return created(JSON.parse(JSON.stringify(revision)))
  } catch (e) {
    console.error('[estimate revise]', e)
    return serverError()
  }
}
