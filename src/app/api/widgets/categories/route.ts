import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function fetchCategories(userId: string) {
  const groups = await prisma.categoryGroup.findMany({
    where: { userId },
    include: { categories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  })
  return groups
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const groups = await fetchCategories(userId)
  return NextResponse.json({ data: groups })
}
