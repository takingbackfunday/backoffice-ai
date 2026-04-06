import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ReceiptsPageClient } from '@/components/receipts/receipts-page-client'

export const metadata = { title: 'Receipts — Backoffice AI' }

export default async function ReceiptsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return <ReceiptsPageClient />
}
