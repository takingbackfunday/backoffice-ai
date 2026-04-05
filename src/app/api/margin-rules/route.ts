import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const UpsertMarginRuleSchema = z.object({
  tag: z.string().min(1, 'Tag is required').toLowerCase(),
  marginPct: z.number().min(0).max(999),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const rules = await prisma.marginRule.findMany({
      where: { userId },
      orderBy: { tag: 'asc' },
    })

    return ok(rules.map(r => ({ ...r, marginPct: Number(r.marginPct) })))
  } catch (e) {
    console.error('[margin-rules GET]', e)
    return serverError()
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = UpsertMarginRuleSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const rule = await prisma.marginRule.upsert({
      where: { userId_tag: { userId, tag: parsed.data.tag } },
      create: { userId, tag: parsed.data.tag, marginPct: parsed.data.marginPct },
      update: { marginPct: parsed.data.marginPct },
    })

    return created({ ...rule, marginPct: Number(rule.marginPct) })
  } catch (e) {
    console.error('[margin-rules POST]', e)
    return serverError()
  }
}
