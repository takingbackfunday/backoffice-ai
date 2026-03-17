import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const row = await prisma.userPreference.findUnique({ where: { userId } })
    return ok((row?.data ?? {}) as Record<string, unknown>)
  } catch (err) {
    console.error('[GET /api/preferences]', err)
    return serverError('Failed to load preferences')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const patch = await request.json()

    // Merge patch into existing preferences (shallow merge of top-level keys)
    const existing = await prisma.userPreference.findUnique({ where: { userId } })
    const current = (existing?.data ?? {}) as Record<string, unknown>
    const merged = { ...current, ...patch }

    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, data: merged },
      update: { data: merged },
    })

    return ok(merged)
  } catch (err) {
    console.error('[POST /api/preferences]', err)
    return serverError('Failed to save preferences')
  }
}
