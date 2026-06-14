import { SignIn } from '@clerk/nextjs'

export const dynamic = 'force-dynamic'

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <SignIn
        routing="path"
        path="/sign-in"
        fallbackRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
      />
    </main>
  )
}
