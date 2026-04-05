import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { ListingPageClient } from '@/components/public/listing-page-client'

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
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
    ...listing,
    monthlyRent: Number(listing.monthlyRent),
    applicationFee: listing.applicationFee ? Number(listing.applicationFee) : null,
    screeningFee: listing.screeningFee ? Number(listing.screeningFee) : null,
    availableDate: listing.availableDate ? listing.availableDate.toISOString() : null,
    photos: listing.photos as string[],
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
    unit: {
      ...listing.unit,
      monthlyRent: listing.unit.monthlyRent ? Number(listing.unit.monthlyRent) : null,
      bathrooms: listing.unit.bathrooms ? Number(listing.unit.bathrooms) : null,
      createdAt: listing.unit.createdAt.toISOString(),
      updatedAt: listing.unit.updatedAt.toISOString(),
    },
  }

  return <ListingPageClient listing={serialized} />
}
