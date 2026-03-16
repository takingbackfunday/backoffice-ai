import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'

const CreateInstitutionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.enum(['US', 'UK', 'DE']),
  csvMapping: z.object({
    dateCol: z.string(),
    amountCol: z.string(),
    descCol: z.string(),
    dateFormat: z.string(),
    amountSign: z.enum(['normal', 'inverted']),
    merchantCol: z.string().optional(),
  }),
  isGlobal: z.boolean().optional().default(false),
})

export async function GET() {
  try {
    const institutions = await prisma.institutionSchema.findMany({
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    })
    return ok(institutions, { count: institutions.length })
  } catch {
    return serverError('Failed to fetch institutions')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateInstitutionSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const institution = await prisma.institutionSchema.create({
      data: {
        ...parsed.data,
        createdByUserId: userId,
        isGlobal: false,
      },
    })

    return created(institution)
  } catch {
    return serverError('Failed to create institution schema')
  }
}
