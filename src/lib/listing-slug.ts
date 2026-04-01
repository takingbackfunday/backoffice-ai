import { prisma } from '@/lib/prisma'

export async function generateListingSlug(propertyName: string, unitLabel: string): Promise<string> {
  const base = `${propertyName}-${unitLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'listing'

  let slug = base
  let counter = 1

  while (true) {
    const existing = await prisma.listing.findUnique({
      where: { publicSlug: slug },
    })
    if (!existing) return slug
    counter++
    slug = `${base}-${counter}`
  }
}
