import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { parsePreferences } from '@/types/preferences'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const row = await prisma.userPreference.findUnique({ where: { userId } })
    return ok(parsePreferences(row?.data))
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
    const current = parsePreferences(existing?.data)
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
