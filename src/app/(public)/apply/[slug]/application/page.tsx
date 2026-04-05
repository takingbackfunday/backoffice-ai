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
            include: { workspace: { select: { name: true } } },
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
    screeningFee: listing.screeningFee ? Number(listing.screeningFee) : null,
    publicSlug: listing.publicSlug,
    requiredDocs: Array.isArray(listing.requiredDocs) ? (listing.requiredDocs as string[]) : [],
    unit: {
      unitLabel: listing.unit.unitLabel,
      propertyProfile: {
        workspace: { name: listing.unit.propertyProfile.workspace.name },
      },
    },
  }

  return <ApplicationFormClient listing={serialized} />
}
