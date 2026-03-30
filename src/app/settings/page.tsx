import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PaymentSettingsForm } from '@/components/settings/payment-settings-form'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const data = (prefs?.data ?? {}) as Record<string, unknown>
  const paymentMethods = (data.paymentMethods ?? {}) as PaymentMethods

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Settings" />
        <main className="flex-1 p-6 max-w-2xl" role="main">
          <h2 className="text-lg font-semibold mb-1">Payment methods</h2>
          <p className="text-sm text-muted-foreground mb-6">
            These details appear on every invoice PDF and email you send to clients. Fill in whichever payment methods you accept.
          </p>
          <PaymentSettingsForm initial={paymentMethods} />
        </main>
      </div>
    </div>
  )
}
