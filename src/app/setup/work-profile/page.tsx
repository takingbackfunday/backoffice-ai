import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { parsePreferences } from '@/types/preferences'
import { WorkProfileSetup } from '@/components/setup/work-profile-setup'

export default async function WorkProfilePage() {
  const session = await auth()
  if (!session?.userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({
    where: { userId: session.userId },
  })
  const data = parsePreferences(prefs?.data)

  if (data.workDescription) {
    redirect('/studio?onboarding=1')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-3xl">
        <div className="rounded-xl border bg-background shadow-sm">
          <div className="px-6 py-5 border-b">
            <h1 className="text-lg font-semibold">Set up your work profile</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Describe what you do and we&rsquo;ll create quote templates and a service-item library tailored to your work.
            </p>
          </div>
          <div className="px-6 py-5">
            <WorkProfileSetup
              mode="onboarding"
              skipTarget="/studio?onboarding=1"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
