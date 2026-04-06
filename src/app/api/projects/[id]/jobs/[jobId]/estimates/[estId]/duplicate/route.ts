import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { created, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; jobId: string; estId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId, estId } = await params

    const estimate = await prisma.estimate.findFirst({
      where: {
        id: estId,
        jobId,
        job: { clientProfile: { workspace: { id, userId } } },
      },
      include: {
        sections: { include: { items: true } },
      },
    })
    if (!estimate) return notFound('Estimate not found')

    const copy = await prisma.estimate.create({
      data: {
        jobId,
        title: `${estimate.title} (copy)`,
        currency: estimate.currency,
        notes: estimate.notes,
        version: 1,
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

    return created(JSON.parse(JSON.stringify(copy)))
  } catch (e) {
    console.error('[estimate duplicate]', e)
    return serverError()
  }
}
