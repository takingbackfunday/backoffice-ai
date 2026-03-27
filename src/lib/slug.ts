import { prisma } from '@/lib/prisma'

/**
 * Generate a URL-safe slug from a project name.
 * If a collision exists for this user, appends -2, -3, etc.
 */
export async function generateSlug(userId: string, name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project'

  let slug = base
  let counter = 1

  while (true) {
    const existing = await prisma.project.findUnique({
      where: { userId_slug: { userId, slug } },
    })
    if (!existing) return slug
    counter++
    slug = `${base}-${counter}`
  }
}
