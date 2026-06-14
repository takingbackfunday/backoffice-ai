import { SignUp } from '@clerk/nextjs'

export const dynamic = 'force-dynamic'

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <SignUp
        routing="path"
        path="/sign-up"
        fallbackRedirectUrl="/dashboard"
        signInUrl="/sign-in"
      />
    </main>
  )
}
