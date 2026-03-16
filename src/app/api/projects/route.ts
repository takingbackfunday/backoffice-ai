import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  type: z.enum(['CLIENT', 'PROPERTY', 'JOB', 'OTHER']),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const projects = await prisma.project.findMany({
      where: { userId },
      include: { _count: { select: { transactions: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return ok(projects, { count: projects.length })
  } catch {
    return serverError('Failed to fetch projects')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const project = await prisma.project.create({
      data: { ...parsed.data, userId },
    })

    return created(project)
  } catch {
    return serverError('Failed to create project')
  }
}
