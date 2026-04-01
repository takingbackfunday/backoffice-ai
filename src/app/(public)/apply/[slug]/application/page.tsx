import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ApplicationFormClient } from '@/components/public/application-form-client'

export default async function ApplicationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const listing = await prisma.listing.findFirst({
    where: { publicSlug: slug, isActive: true },
    include: {
      unit: {
        include: {
          propertyProfile: {
            include: { project: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!listing) return notFound()

  const serialized = {
    id: listing.id,
    title: listing.title,
    monthlyRent: Number(listing.monthlyRent),
    applicationFee: listing.applicationFee ? Number(listing.applicationFee) : null,
    publicSlug: listing.publicSlug,
    unit: {
      unitLabel: listing.unit.unitLabel,
      propertyProfile: {
        project: { name: listing.unit.propertyProfile.project.name },
      },
    },
  }

  return <ApplicationFormClient listing={serialized} />
}
