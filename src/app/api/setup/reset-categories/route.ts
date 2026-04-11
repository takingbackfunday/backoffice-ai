import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { parsePreferences } from '@/types/preferences'

export async function POST() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    // 1. Null out categoryId on all transactions
    await prisma.transaction.updateMany({
      where: { account: { userId }, categoryId: { not: null } },
      data: { categoryId: null, category: null },
    })

    // 2. Delete rule suggestions (reference old categories)
    await prisma.ruleSuggestion.deleteMany({ where: { userId } })

    // 3. Delete categorization rules (reference old categories)
    await prisma.categorizationRule.deleteMany({ where: { userId } })

    // 4. Delete categories (FK constraint — must go before groups)
    await prisma.category.deleteMany({ where: { userId } })

    // 5. Delete category groups
    await prisma.categoryGroup.deleteMany({ where: { userId } })

    // 6. Clear businessType from preferences so picker appears
    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    if (prefs) {
      const data = parsePreferences(prefs.data)
      delete data.businessType
      await prisma.userPreference.update({
        where: { userId },
        data: { data: data as never },
      })
    }

    return ok({ reset: true })
  } catch (err) {
    console.error('[POST /api/setup/reset-categories]', err)
    return serverError('Failed to reset categories')
  }
}
