import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PaymentSettingsForm, Section } from '@/components/settings/payment-settings-form'
import { AiFeaturesForm } from '@/components/settings/ai-features-form'
import { MarginRulesEditor } from '@/components/settings/margin-rules-editor'
import { ServiceItemsEditor } from '@/components/settings/service-items-editor'
import { QuoteDefaultsForm } from '@/components/settings/quote-defaults-form'
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

  const marginRules = await prisma.marginRule.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  const serviceItems = await prisma.serviceItem.findMany({ where: { userId }, orderBy: { usageCount: 'desc' } })
  const quoteValidityDays = data.quoteValidityDays ?? 30
  const quoteTerms = data.quoteTerms ?? ''

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

          <div className="max-w-xl space-y-8 mt-8">
            <Section title="Quote defaults" id="quote-defaults">
              <QuoteDefaultsForm />
            </Section>

            <Section title="Service library" id="service-library">
              <ServiceItemsEditor initialItems={serviceItems.map(i => ({
                id: i.id,
                description: i.description,
                unit: i.unit ?? '',
                defaultRate: Number(i.defaultRate),
                defaultCostRate: i.defaultCostRate ? Number(i.defaultCostRate) : null,
                tags: i.tags,
              }))} />
            </Section>

            <Section title="Margin rules" id="margin-rules">
              <MarginRulesEditor initialRules={marginRules.map(r => ({
                id: r.id,
                tag: r.tag,
                marginPct: Number(r.marginPct),
              }))} />
            </Section>

            <AiFeaturesForm initialAiRuleSuggestions={!!data.aiRuleSuggestions} />
          </div>
        </main>
      </div>
    </div>
  )
}
