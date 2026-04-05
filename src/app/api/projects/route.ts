import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, serverError } from '@/lib/api-response'
import { generateSlug } from '@/lib/slug'

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  type: z.enum(['CLIENT', 'PROPERTY', 'OTHER']),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  client: z.object({
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    company: z.string().optional(),
    address: z.string().optional(),
    billingType: z.enum(['HOURLY', 'FIXED', 'RETAINER', 'MILESTONE']).optional(),
    defaultRate: z.number().optional(),
    currency: z.string().optional(),
    paymentTermDays: z.number().int().min(0).optional(),
  }).optional(),
  property: z.object({
    address: z.string().min(1, 'Property address is required'),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    propertyType: z.enum(['RESIDENTIAL', 'MULTI_FAMILY', 'COMMERCIAL', 'MIXED_USE', 'LAND']).optional(),
    yearBuilt: z.number().int().optional(),
    squareFootage: z.number().int().optional(),
    lotSize: z.string().optional(),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional(),
    currentValue: z.number().optional(),
    mortgageBalance: z.number().optional(),
  }).optional(),
  units: z.array(z.object({
    unitLabel: z.string().min(1),
    bedrooms: z.number().int().optional(),
    bathrooms: z.number().optional(),
    squareFootage: z.number().int().optional(),
    monthlyRent: z.number().optional(),
  })).optional(),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const where: Record<string, unknown> = { userId }
    if (type && ['CLIENT', 'PROPERTY', 'OTHER'].includes(type)) {
      where.type = type
    }

    const projects = await prisma.workspace.findMany({
      where,
      include: {
        _count: { select: { transactions: true } },
        clientProfile: { include: { _count: { select: { jobs: true } } } },
        propertyProfile: { include: { _count: { select: { units: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(projects, { count: projects.length })
  } catch {
    return serverError('Failed to fetch projects')
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const parsed = CreateProjectSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { name, type, description, isActive, client, property, units } = parsed.data

    if (type === 'PROPERTY' && !property?.address) {
      return badRequest('Property address is required')
    }

    const slug = await generateSlug(userId, name)

    const project = await prisma.workspace.create({
      data: {
        userId,
        name,
        slug,
        type,
        description,
        isActive,
        ...(type === 'CLIENT' ? {
          clientProfile: {
            create: {
              contactName: client?.contactName,
              email: client?.email || undefined,
              phone: client?.phone,
              company: client?.company,
              address: client?.address,
              billingType: client?.billingType ?? 'HOURLY',
              defaultRate: client?.defaultRate,
              currency: client?.currency ?? 'USD',
              paymentTermDays: client?.paymentTermDays ?? 30,
            },
          },
        } : {}),
        ...(type === 'PROPERTY' && property ? {
          propertyProfile: {
            create: {
              address: property.address,
              city: property.city,
              state: property.state,
              zipCode: property.zipCode,
              country: property.country ?? 'US',
              propertyType: property.propertyType ?? 'RESIDENTIAL',
              yearBuilt: property.yearBuilt,
              squareFootage: property.squareFootage,
              lotSize: property.lotSize,
              purchasePrice: property.purchasePrice,
              purchaseDate: property.purchaseDate ? new Date(property.purchaseDate) : undefined,
              currentValue: property.currentValue,
              mortgageBalance: property.mortgageBalance,
              units: {
                create: (units && units.length > 0 ? units : [{ unitLabel: 'Main' }]).map(u => ({
                  unitLabel: u.unitLabel,
                  bedrooms: u.bedrooms,
                  bathrooms: u.bathrooms,
                  squareFootage: u.squareFootage,
                  monthlyRent: u.monthlyRent,
                })),
              },
            },
          },
        } : {}),
      },
      include: {
        clientProfile: true,
        propertyProfile: { include: { units: true } },
      },
    })

    return created(project)
  } catch (err) {
    console.error('Failed to create project:', err)
    return serverError('Failed to create project')
  }
}
