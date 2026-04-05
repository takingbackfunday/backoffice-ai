import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { seedDefaultCategories, type BusinessType } from '@/lib/seed-categories'
import { generateSlug } from '@/lib/slug'

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
    const merged = { ...current, businessType, onboardingStep: 'accounts' }

    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, data: merged as never },
      update: { data: merged as never },
    })

    // Seed categories for this business type
    await seedDefaultCategories(userId, prisma, businessType)

    // Create "Business Overhead" workspace for business types
    let overheadWorkspace = null
    if (['freelance', 'property', 'both'].includes(businessType)) {
      const existingDefault = await prisma.workspace.findFirst({
        where: { userId, isDefault: true },
      })
      if (!existingDefault) {
        const slug = await generateSlug(userId, 'Business Overhead')
        overheadWorkspace = await prisma.workspace.create({
          data: {
            userId,
            name: 'Business Overhead',
            slug,
            type: 'OTHER',
            description:
              'General business expenses not tied to a specific client or property — subscriptions, insurance, office costs, etc.',
            isDefault: true,
          },
        })
      }
    }

    const redirectTo =
      businessType === 'freelance' ? '/studio?onboarding=1' :
      businessType === 'property'  ? '/portfolio?onboarding=1' :
      businessType === 'both'      ? '/dashboard?onboarding=1' :
      '/bank-accounts?onboarding=1'

    return ok({ businessType, overheadWorkspace, redirectTo })
  } catch (err) {
    console.error('[POST /api/setup/business-type]', err)
    return serverError('Failed to save business type')
  }
}
