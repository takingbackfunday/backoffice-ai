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
    const totalSlots = toInstall.length
    // Starter rules sit AFTER user rules (which default to 50), so base at 51
    const basePriority = lowest ? lowest.priority + 1 : 51

    // Payee rules (group: 'payee') get lower priority numbers than keyword rules
    // so merchant-specific rules always beat broad keyword patterns
    const payeeRules = toInstall.filter((s) => s.def.group === 'payee')
    const keywordRules = toInstall.filter((s) => s.def.group === 'category')
    const ordered = [...payeeRules, ...keywordRules]

    await prisma.categorizationRule.createMany({
      data: ordered.map((s, i) => ({
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
