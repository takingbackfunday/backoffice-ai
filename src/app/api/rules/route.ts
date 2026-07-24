import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, serverError, type ApiResponse } from '@/lib/api-response'
import { resolveRulePayee, conflictsForSavedRule } from '@/lib/rules/rule-write'

const ConditionDefSchema = z.object({
  field: z.enum([
    'description', 'payeeName', 'rawDescription', 'amount', 'currency',
    'accountName', 'notes', 'tag', 'date', 'month', 'dayOfWeek',
  ]),
  operator: z.enum([
    'contains', 'not_contains', 'equals', 'not_equals',
    'starts_with', 'ends_with', 'regex',
    'gt', 'lt', 'gte', 'lte', 'between',
    'in', 'oneOf', 'includes', 'excludes',
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.tuple([z.number(), z.number()])]),
})

const ConditionGroupSchema = z.object({
  all: z.array(ConditionDefSchema).optional(),
  any: z.array(ConditionDefSchema).optional(),
}).refine((g) => (g.all ?? g.any ?? []).length > 0, {
  message: 'conditions must have at least one rule in "all" or "any"',
})

const CreateRuleSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(1).max(99).default(50),
  conditions: ConditionGroupSchema,
  categoryName: z.string().default(''),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  payeeName: z.string().nullable().optional(),
  workspaceId: z.string().nullable().optional(),
  setNotes: z.string().nullable().optional(),
  addTags: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
})

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const rules = await prisma.categorizationRule.findMany({
      where: { userId },
      include: {
        workspace: { select: { id: true, name: true } },
        categoryRef: { include: { group: true } },
        payee: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return ok(rules, { count: rules.length })
  } catch {
    return serverError('Failed to fetch rules')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateRuleSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { workspaceId, payeeName, payeeId: rawPayeeId, categoryId, setNotes, addTags, ...rest } = parsed.data

    // Verify project belongs to user if provided
    if (workspaceId) {
      const project = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } })
      if (!project) return badRequest('Project not found or does not belong to you')
    }

    // Payees are never created implicitly — resolve an existing one or reject.
    const resolved = await resolveRulePayee(userId, { payeeId: rawPayeeId, payeeName })
    if ('error' in resolved) return badRequest(resolved.error)
    const payeeId = resolved.payeeId

    const rule = await prisma.categorizationRule.create({
      data: {
        ...rest,
        payeeId,
        workspaceId: workspaceId ?? null,
        categoryId: categoryId ?? null,
        setNotes: setNotes ?? null,
        addTags: addTags ?? [],
        userId,
      },
      include: {
        workspace: { select: { id: true, name: true } },
        categoryRef: { include: { group: true } },
        payee: true,
      },
    })

    // Informational conflict warnings (defense in depth — never blocks the write)
    const conflicts = await conflictsForSavedRule(userId, rule)
    return NextResponse.json<ApiResponse<typeof rule>>({ data: rule, error: null, meta: { conflicts } }, { status: 201 })
  } catch {
    return serverError('Failed to create rule')
  }
}
