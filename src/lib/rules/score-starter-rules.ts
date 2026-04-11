import { prisma } from '@/lib/prisma'
import { STARTER_RULES, resolveCategoryName, type StarterRuleDef } from './seed-rules'
import { parsePreferences } from '@/types/preferences'

export interface ScoredStarterRule {
  def: StarterRuleDef
  categoryName: string     // resolved for this user's businessType
  categoryId: string       // matched from the user's actual category tree
  alreadyInstalled: boolean
}

async function getUserBusinessType(userId: string): Promise<string> {
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  if (!pref) return 'personal'
  return parsePreferences(pref.data).businessType ?? 'personal'
}

export async function scoreStarterRules(userId: string): Promise<ScoredStarterRule[]> {
  const [businessType, allCategories, existingRules] = await Promise.all([
    getUserBusinessType(userId),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
    prisma.categorizationRule.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ])

  // Build a case-insensitive name → id map for fast lookups
  const categoryByName = new Map<string, string>()
  for (const cat of allCategories) {
    categoryByName.set(cat.name.toLowerCase(), cat.id)
  }

  // Track which starter rule IDs are already installed by name match
  const installedNames = new Set(existingRules.map((r) => r.name.toLowerCase()))

  const scored: ScoredStarterRule[] = []

  for (const def of STARTER_RULES) {
    const categoryName = resolveCategoryName(def, businessType)

    // Skip rules not applicable to this user's business type
    if (!categoryName) continue

    // Skip rules whose target category doesn't exist in the user's tree
    const categoryId = categoryByName.get(categoryName.toLowerCase())
    if (!categoryId) continue

    scored.push({
      def,
      categoryName,
      categoryId,
      alreadyInstalled: installedNames.has(def.name.toLowerCase()),
    })
  }

  return scored
}
