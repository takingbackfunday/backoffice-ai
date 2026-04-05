import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectCreationWizard } from '@/components/projects/project-creation-wizard'

export default async function NewProjectPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="New Project" />
        <main className="flex-1 p-6" role="main">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
            <ProjectCreationWizard />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
