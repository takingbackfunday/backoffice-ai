import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { UploadPageClient } from '@/components/upload/upload-page-client'

export const metadata = { title: 'Import — Backoffice AI' }

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { onboarding } = await searchParams

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { institution: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <UploadPageClient
      initialAccounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        institution: { name: a.institution.name },
      }))}
      onboarding={onboarding === '1'}
    />
  )
}
