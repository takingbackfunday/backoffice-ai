import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PaymentSettingsForm } from '@/components/settings/payment-settings-form'
import { AiFeaturesForm } from '@/components/settings/ai-features-form'
import { parsePreferences } from '@/types/preferences'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const data = parsePreferences(prefs?.data)
  const paymentMethods = data.paymentMethods ?? {}
  const businessName = data.businessName ?? ''
  const yourName = data.yourName ?? ''
  const invoicePaymentNote = data.invoicePaymentNote ?? ''
  const invoiceNotesDefault = data.invoiceNotesDefault ?? ''
  const fromEmail = data.fromEmail ?? ''
  const fromPhone = data.fromPhone ?? ''
  const fromAddress = data.fromAddress ?? ''
  const fromVatNumber = data.fromVatNumber ?? ''
  const fromWebsite = data.fromWebsite ?? ''
  const logoUrl = data.logoUrl ?? ''
  const invoiceTemplate = data.invoiceTemplate ?? 'top-left'
  const invoiceShowBusinessName = data.invoiceShowBusinessName ?? true

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Settings" />
        <main className="flex-1 p-6" role="main">
          <h2 className="text-lg font-semibold mb-1">Settings</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your business profile and payment details appear on every invoice you send.
          </p>
          <PaymentSettingsForm
            initial={paymentMethods}
            initialBusinessName={businessName}
            initialYourName={yourName}
            initialLogoUrl={logoUrl}
            initialPaymentNote={invoicePaymentNote}
            initialNotesDefault={invoiceNotesDefault}
            initialEmail={fromEmail}
            initialPhone={fromPhone}
            initialAddress={fromAddress}
            initialVatNumber={fromVatNumber}
            initialWebsite={fromWebsite}
            initialTemplate={invoiceTemplate}
            initialShowBusinessName={invoiceShowBusinessName}
          />
          <div className="max-w-xl">
            <AiFeaturesForm initialAiRuleSuggestions={!!data.aiRuleSuggestions} />
          </div>
        </main>
      </div>
    </div>
  )
}
