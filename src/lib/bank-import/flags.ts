import { notFound } from '@/lib/api-response'
import type { NextResponse } from 'next/server'

type RouteContext = { params: Promise<unknown> }
type RouteHandler = (request: Request, context?: RouteContext) => Promise<NextResponse>

export function bankImportEnabled(): boolean {
  return process.env.BANK_IMPORT_ENABLED === '1'
}

export function bankImportEnabledForUser(userId: string): boolean {
  if (!bankImportEnabled()) return false
  const allowlist = (process.env.BANK_IMPORT_ENABLED_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  return allowlist.length === 0 || allowlist.includes(userId)
}

/** Keep the feature-flag check outside authedRoute so disabled APIs return 404 before auth/body parsing. */
export function withBankImportFlag(handler: RouteHandler): RouteHandler {
  return (request, context) => bankImportEnabled() ? handler(request, context) : Promise.resolve(notFound())
}
