import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/(.*)',
  '/api/auth/callback',
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) auth.protect()

  const { userId, sessionClaims } = await auth()
  const url = req.nextUrl

  // After sign-in/sign-up, route tenants to portal, everyone else to dashboard
  if (userId && (url.pathname === '/sign-in' || url.pathname === '/sign-up')) {
    const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
    if (role === 'tenant') {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Prevent tenants from accessing owner routes
  if (userId && url.pathname.startsWith('/dashboard')) {
    const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role
    if (role === 'tenant') {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
  }
})

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
