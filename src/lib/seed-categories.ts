import { prisma } from './prisma'
import type { PrismaClient } from '@prisma/client'

const DEFAULT_CATEGORIES: { group: string; categories: string[] }[] = [
  {
    group: 'Income',
    categories: ['Sales / Revenue', 'Interest'],
  },
  {
    group: 'Operating Expenses',
    categories: [
      'Rent & Utilities',
      'Software & Subscriptions',
      'Office Supplies',
      'Professional Services',
      'Travel',
      'Meals & Entertainment',
      'Bank Fees',
    ],
  },
  {
    group: 'Transfers',
    categories: ['Account Transfer'],
  },
]

export async function seedDefaultCategories(
  userId: string,
  db: PrismaClient = prisma
) {
  for (let gi = 0; gi < DEFAULT_CATEGORIES.length; gi++) {
    const { group: groupName, categories } = DEFAULT_CATEGORIES[gi]
    const group = await db.categoryGroup.upsert({
      where: {
        id: `default-${userId}-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
      },
      update: {},
      create: {
        id: `default-${userId}-${groupName.toLowerCase().replace(/\s+/g, '-')}`,
        userId,
        name: groupName,
        sortOrder: gi,
      },
    })

    for (let ci = 0; ci < categories.length; ci++) {
      const catName = categories[ci]
      await db.category.upsert({
        where: {
          id: `default-${userId}-${catName.toLowerCase().replace(/[\s/&]+/g, '-')}`,
        },
        update: {},
        create: {
          id: `default-${userId}-${catName.toLowerCase().replace(/[\s/&]+/g, '-')}`,
          userId,
          name: catName,
          groupId: group.id,
          sortOrder: ci,
        },
      })
    }
  }
}
