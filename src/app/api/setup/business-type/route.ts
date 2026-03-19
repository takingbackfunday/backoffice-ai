import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { seedDefaultCategories, type BusinessType } from '@/lib/seed-categories'

const VALID_TYPES: BusinessType[] = ['freelance', 'property', 'both', 'personal']

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const businessType = body.businessType as BusinessType

    if (!VALID_TYPES.includes(businessType)) {
      return badRequest('businessType must be "freelance", "property", or "both"')
    }

    // Save preference
    const existing = await prisma.userPreference.findUnique({ where: { userId } })
    const current = (existing?.data ?? {}) as Record<string, unknown>
    const merged = { ...current, businessType }

    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, data: merged },
      update: { data: merged },
    })

    // Seed categories for this business type
    await seedDefaultCategories(userId, prisma, businessType)

    return ok({ businessType })
  } catch (err) {
    console.error('[POST /api/setup/business-type]', err)
    return serverError('Failed to save business type')
  }
}
