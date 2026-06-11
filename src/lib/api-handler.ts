import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { NotFoundError } from '@/lib/not-found-error'

type HandlerCtx<P = void, B = void> = {
  userId: string
  params: P
  body: B
  request: Request
}

type HandlerFn<P, B> = (ctx: HandlerCtx<P, B>) => Promise<import('next/server').NextResponse>

type NextRouteCtx = { params: Promise<unknown> }

/**
 * Wraps a Next.js App Router handler with auth, Zod validation, and error handling.
 *
 * Eliminates per-route boilerplate:
 *   - Auth extraction (Clerk)
 *   - Params awaiting
 *   - Body parsing + Zod validation
 *   - Try/catch → error responses
 *   - NotFoundError → 404
 *
 * @example
 * // POST /api/projects (no dynamic params)
 * export const POST = authedRoute({
 *   bodySchema: CreateProjectSchema,
 *   handler: async ({ userId, body }) => { ... },
 * })
 *
 * @example
 * // GET /api/projects/[id]/invoices/[invoiceId]
 * export const GET = authedRoute<{ id: string; invoiceId: string }>({
 *   handler: async ({ userId, params }) => { ... },
 * })
 */
export function authedRoute<P = void, B = void>(opts: {
  paramsSchema?: z.ZodType<P>
  bodySchema?: z.ZodType<unknown>
  handler: HandlerFn<P, B>
}) {
  return async (request: Request, route?: NextRouteCtx) => {
    try {
      const { userId } = await auth()
      if (!userId) return unauthorized()

      const rawParams = route ? await route.params : {}
      const params = opts.paramsSchema
        ? opts.paramsSchema.parse(rawParams)
        : (rawParams as P)

      let body = undefined as B
      if (opts.bodySchema) {
        const raw = await request.json().catch(() => ({}))
        const parsed = opts.bodySchema.safeParse(raw)
        if (!parsed.success) {
          return badRequest(parsed.error.issues.map(i => i.message).join('; '))
        }
        body = parsed.data as B
      }

      return await opts.handler({ userId, params, body, request })
    } catch (err) {
      if (err instanceof NotFoundError) {
        return notFound(err.message)
      }
      console.error(err)
      return serverError()
    }
  }
}
