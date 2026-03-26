import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { scoreStarterRules } from '@/lib/rules/score-starter-rules'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const scored = await scoreStarterRules(userId)
    return ok(scored)
  } catch {
    return serverError('Failed to load starter rules')
  }
}

const InstallSchema = z.object({
  ids: z.array(z.string()).min(1),
})

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = InstallSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { ids } = parsed.data

    // Score to validate and resolve category IDs for the selected rules
    const allScored = await scoreStarterRules(userId)
    const toInstall = allScored.filter((s) => ids.includes(s.def.id) && !s.alreadyInstalled)

    if (toInstall.length === 0) {
      return ok({ installed: 0 })
    }

    // Find the lowest existing priority to insert before user's rules
    const lowest = await prisma.categorizationRule.findFirst({
      where: { userId },
      orderBy: { priority: 'asc' },
      select: { priority: true },
    })
    const basePriority = lowest ? Math.max(1, lowest.priority - toInstall.length) : 10

    await prisma.categorizationRule.createMany({
      data: toInstall.map((s, i) => ({
        userId,
        name: s.def.name,
        priority: basePriority + i,
        conditions: s.def.conditions as object,
        categoryName: s.categoryName,
        categoryId: s.categoryId,
        isActive: true,
        addTags: [],
      })),
    })

    return ok({ installed: toInstall.length })
  } catch {
    return serverError('Failed to install starter rules')
  }
}
