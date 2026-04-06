import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; entryId: string }> }

async function getEntry(entryId: string, projectId: string, userId: string) {
  return prisma.timeEntry.findFirst({
    where: { id: entryId, workspaceId: projectId, workspace: { userId } },
  })
}

const UpdateTimeEntrySchema = z.object({
  date: z.string().optional(),
  minutes: z.number().int().min(1).optional(),
  description: z.string().min(1).optional(),
  billable: z.boolean().optional(),
  rate: z.number().positive().nullable().optional(),
  jobId: z.string().nullable().optional(),
})

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, entryId } = await params

    const entry = await getEntry(entryId, id, userId)
    if (!entry) return notFound('Time entry not found')

    const body = await request.json()
    const parsed = UpdateTimeEntrySchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { date, ...rest } = parsed.data
    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        ...rest,
        ...(date ? { date: new Date(date) } : {}),
      },
      include: { job: { select: { id: true, name: true } } },
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    console.error('[time PATCH]', e)
    return serverError()
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, entryId } = await params

    const entry = await getEntry(entryId, id, userId)
    if (!entry) return notFound('Time entry not found')

    await prisma.timeEntry.delete({ where: { id: entryId } })
    return ok({ id: entryId })
  } catch (e) {
    console.error('[time DELETE]', e)
    return serverError()
  }
}
