// Check for slug collisions in the category seed data
import { getCategoryCounts } from '../src/lib/seed-categories'

const ALL_CATEGORIES = (await import('../src/lib/seed-categories')).getCategoryCounts

// We need the raw data — let's just inline the slug logic
const slugify = (s: string) =>
  s.toLowerCase().replace(/[\s/&'(),<>]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')

// Import the module to access ALL_CATEGORIES indirectly via a test seed
import { PrismaClient } from '@prisma/client'
import { seedDefaultCategories } from '../src/lib/seed-categories'

const prisma = new PrismaClient()
const userId = 'collision-test-user'

// Intercept creates to find collisions
const seen = new Map<string, string>()
const origCreate = prisma.categoryGroup.create.bind(prisma.categoryGroup)
let collision: string | null = null

try {
  await seedDefaultCategories(userId, prisma, 'both')
  console.log('No errors — checking DB for collision...')
  const groups = await prisma.categoryGroup.findMany({ where: { userId } })
  console.log('Groups created:', groups.length)
  const cats = await prisma.category.findMany({ where: { userId } })
  console.log('Categories created:', cats.length)
} catch(e: unknown) {
  console.error('SEED ERROR:', (e as Error).message)
} finally {
  await prisma.category.deleteMany({ where: { userId } })
  await prisma.categoryGroup.deleteMany({ where: { userId } })
  await prisma.$disconnect()
}
