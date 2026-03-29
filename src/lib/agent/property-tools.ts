import { prisma } from '@/lib/prisma'
import type { ToolDefinition } from '@/lib/llm/openrouter'

// ── Tool Definitions ───────────────────────────────────────────────────────────

export const PROPERTY_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_properties',
      description: 'List all properties owned by the user with basic stats (unit count, occupancy).',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_property',
      description: 'Get details for a single property by name or address.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (partial match OK)' },
        },
        required: ['propertyName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_units',
      description: 'List all units for a property, including status, rent, and current tenant.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (partial match OK)' },
          status: {
            type: 'string',
            enum: ['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED'],
            description: 'Filter by unit status',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_occupancy_summary',
      description: 'Get portfolio-wide or per-property occupancy rates and revenue summary.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Scope to a single property (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_leases',
      description: 'List active leases, optionally filtered by property or expiry window.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (optional)' },
          expiringWithinDays: { type: 'number', description: 'Only return leases expiring within N days' },
          status: {
            type: 'string',
            enum: ['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH', 'EXPIRED', 'TERMINATED'],
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tenant',
      description: 'Look up a tenant by name and return their contact info, lease, and balance.',
      parameters: {
        type: 'object',
        properties: {
          tenantName: { type: 'string', description: 'Tenant name (partial match OK)' },
        },
        required: ['tenantName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rent_roll',
      description: 'Return the full rent roll: every unit with its lease, tenant, and monthly rent.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Scope to one property (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tenant_balance',
      description: 'Get the outstanding balance for a tenant (charges minus payments).',
      parameters: {
        type: 'object',
        properties: {
          tenantName: { type: 'string', description: 'Tenant name (partial match OK)' },
        },
        required: ['tenantName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tenant_payments',
      description: 'List payment history for a tenant or all tenants in a property.',
      parameters: {
        type: 'object',
        properties: {
          tenantName: { type: 'string', description: 'Tenant name (optional)' },
          propertyName: { type: 'string', description: 'Property name (optional)' },
          dateFrom: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
          dateTo: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_overdue_tenants',
      description: 'List tenants with an outstanding balance (charges exceed payments).',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Scope to one property (optional)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_maintenance_requests',
      description: 'List maintenance requests, optionally filtered by status or property.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (optional)' },
          status: {
            type: 'string',
            enum: ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
          },
          priority: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'],
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_property_revenue',
      description: 'Sum of all tenant payments received for a property in a date range.',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (optional = all)' },
          dateFrom: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
          dateTo: { type: 'string', description: 'ISO date (YYYY-MM-DD)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vacancy_cost',
      description: 'Estimate the revenue lost to vacant units (months × monthly rent of vacant units).',
      parameters: {
        type: 'object',
        properties: {
          propertyName: { type: 'string', description: 'Property name (optional = all)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_unit_messages',
      description: 'List message/communication history between owner and tenants. Use this when asked about communication, correspondence, notes, or messages with a tenant.',
      parameters: {
        type: 'object',
        properties: {
          tenantName: { type: 'string', description: 'Filter by tenant name (partial match, optional)' },
          propertyName: { type: 'string', description: 'Filter by property name (optional)' },
          isRead: { type: 'boolean', description: 'Filter by read status (optional)' },
          limit: { type: 'number', description: 'Max messages to return (default 20)' },
        },
        required: [],
      },
    },
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

async function propertyWhere(userId: string, propertyName?: string) {
  return {
    project: {
      userId,
      type: 'PROPERTY' as const,
      isActive: true,
      ...(propertyName ? { name: { contains: propertyName, mode: 'insensitive' as const } } : {}),
    },
  }
}

async function findTenantIdsByName(userId: string, tenantName: string): Promise<string[]> {
  const tenants = await prisma.tenant.findMany({
    where: { userId, name: { contains: tenantName, mode: 'insensitive' } },
    select: { id: true },
  })
  return tenants.map(t => t.id)
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchPropertyTool(userId: string, toolName: string, args: unknown): Promise<string> {
  const a = (args ?? {}) as Record<string, unknown>

  switch (toolName) {
    case 'list_properties': {
      const props = await prisma.propertyProfile.findMany({
        where: { project: { userId, type: 'PROPERTY', isActive: true } },
        include: {
          project: { select: { name: true, slug: true } },
          units: { select: { id: true, status: true, monthlyRent: true } },
        },
      })
      if (!props.length) return 'No properties found.'
      const rows = props.map(p => {
        const total = p.units.length
        const leased = p.units.filter(u => u.status === 'LEASED').length
        const monthlyRev = p.units
          .filter(u => u.status === 'LEASED' && u.monthlyRent)
          .reduce((s, u) => s + Number(u.monthlyRent), 0)
        return `${p.project.name} | ${p.address}${p.city ? ', ' + p.city : ''} | ${leased}/${total} occupied | $${monthlyRev.toLocaleString()}/mo revenue`
      })
      return rows.join('\n')
    }

    case 'get_property': {
      const name = String(a.propertyName ?? '')
      const prop = await prisma.propertyProfile.findFirst({
        where: { project: { userId, type: 'PROPERTY', isActive: true, name: { contains: name, mode: 'insensitive' } } },
        include: {
          project: { select: { name: true } },
          units: { select: { id: true, status: true, monthlyRent: true, unitLabel: true } },
        },
      })
      if (!prop) return `No property found matching "${name}".`
      const leased = prop.units.filter(u => u.status === 'LEASED').length
      return JSON.stringify({
        name: prop.project.name,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        type: prop.propertyType,
        units: prop.units.length,
        occupied: leased,
        vacant: prop.units.length - leased,
        purchasePrice: prop.purchasePrice ? Number(prop.purchasePrice) : null,
        currentValue: prop.currentValue ? Number(prop.currentValue) : null,
        mortgageBalance: prop.mortgageBalance ? Number(prop.mortgageBalance) : null,
      })
    }

    case 'list_units': {
      const propFilter = a.propertyName ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } } : { project: { userId, type: 'PROPERTY' as const, isActive: true } }
      const units = await prisma.unit.findMany({
        where: {
          propertyProfile: propFilter,
          ...(a.status ? { status: String(a.status) as never } : {}),
        },
        include: {
          propertyProfile: { include: { project: { select: { name: true } } } },
          leases: {
            where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
            include: { tenant: { select: { name: true } } },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ propertyProfile: { project: { name: 'asc' } } }, { unitLabel: 'asc' }],
      })
      if (!units.length) return 'No units found.'
      return units.map(u => {
        const lease = u.leases[0]
        return `${u.propertyProfile.project.name} / ${u.unitLabel} | ${u.status} | $${u.monthlyRent ? Number(u.monthlyRent) : 0}/mo | Tenant: ${lease?.tenant.name ?? 'none'} | Lease ends: ${lease?.endDate ? new Date(lease.endDate).toISOString().slice(0, 10) : 'n/a'}`
      }).join('\n')
    }

    case 'get_occupancy_summary': {
      const propFilter = a.propertyName
        ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } }
        : { project: { userId, type: 'PROPERTY' as const, isActive: true } }
      const units = await prisma.unit.findMany({
        where: { propertyProfile: propFilter },
        select: { status: true, monthlyRent: true },
      })
      if (!units.length) return 'No units found.'
      const total = units.length
      const leased = units.filter(u => u.status === 'LEASED').length
      const vacant = units.filter(u => u.status === 'VACANT').length
      const revenue = units.filter(u => u.status === 'LEASED' && u.monthlyRent).reduce((s, u) => s + Number(u.monthlyRent), 0)
      return `Total units: ${total}\nLeased: ${leased} (${Math.round(leased / total * 100)}%)\nVacant: ${vacant}\nMonthly revenue: $${revenue.toLocaleString()}`
    }

    case 'list_leases': {
      const now = new Date()
      const cutoff = a.expiringWithinDays ? new Date(now.getTime() + Number(a.expiringWithinDays) * 86400000) : undefined
      const leases = await prisma.lease.findMany({
        where: {
          unit: {
            propertyProfile: a.propertyName
              ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } }
              : { project: { userId, type: 'PROPERTY' as const, isActive: true } },
          },
          ...(a.status ? { status: String(a.status) as never } : { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } }),
          ...(cutoff ? { endDate: { lte: cutoff, gte: now } } : {}),
        },
        include: {
          tenant: { select: { name: true, email: true, phone: true } },
          unit: {
            include: {
              propertyProfile: { include: { project: { select: { name: true } } } },
            },
          },
        },
        orderBy: { endDate: 'asc' },
      })
      if (!leases.length) return 'No leases found.'
      return leases.map(l => `${l.unit.propertyProfile.project.name} / ${l.unit.unitLabel} | Tenant: ${l.tenant.name} | Status: ${l.status} | $${Number(l.monthlyRent)}/mo | Start: ${l.startDate.toISOString().slice(0, 10)} | End: ${l.endDate.toISOString().slice(0, 10)}`).join('\n')
    }

    case 'get_tenant': {
      const name = String(a.tenantName ?? '')
      const tenant = await prisma.tenant.findFirst({
        where: { userId, name: { contains: name, mode: 'insensitive' } },
        include: {
          leases: {
            where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
            include: {
              unit: { include: { propertyProfile: { include: { project: { select: { name: true } } } } } },
            },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
          tenantCharges: { where: { forgivenAt: null }, select: { amount: true } },
          tenantPayments: { select: { amount: true } },
        },
      })
      if (!tenant) return `No tenant found matching "${name}".`
      const charged = tenant.tenantCharges.reduce((s, c) => s + Number(c.amount), 0)
      const paid = tenant.tenantPayments.reduce((s, p) => s + Number(p.amount), 0)
      const lease = tenant.leases[0]
      return JSON.stringify({
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        property: lease?.unit.propertyProfile.project.name ?? null,
        unit: lease?.unit.unitLabel ?? null,
        leaseStatus: lease?.status ?? 'none',
        monthlyRent: lease ? Number(lease.monthlyRent) : null,
        leaseEnds: lease?.endDate.toISOString().slice(0, 10) ?? null,
        totalCharged: charged,
        totalPaid: paid,
        balance: charged - paid,
      })
    }

    case 'get_rent_roll': {
      const units = await prisma.unit.findMany({
        where: {
          propertyProfile: a.propertyName
            ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } }
            : { project: { userId, type: 'PROPERTY' as const, isActive: true } },
        },
        include: {
          propertyProfile: { include: { project: { select: { name: true } } } },
          leases: {
            where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
            include: { tenant: { select: { name: true } } },
            orderBy: { startDate: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ propertyProfile: { project: { name: 'asc' } } }, { unitLabel: 'asc' }],
      })
      if (!units.length) return 'No units found.'
      return units.map(u => {
        const l = u.leases[0]
        return `${u.propertyProfile.project.name} / ${u.unitLabel} | ${u.status} | Tenant: ${l?.tenant.name ?? 'vacant'} | Rent: $${l ? Number(l.monthlyRent) : 0}/mo | Ends: ${l?.endDate ? l.endDate.toISOString().slice(0, 10) : 'n/a'}`
      }).join('\n')
    }

    case 'get_tenant_balance': {
      const name = String(a.tenantName ?? '')
      const tenantIds = await findTenantIdsByName(userId, name)
      if (!tenantIds.length) return `No tenant found matching "${name}".`
      const [charges, payments] = await Promise.all([
        prisma.tenantCharge.aggregate({
          where: { lease: { tenantId: { in: tenantIds } }, forgivenAt: null },
          _sum: { amount: true },
        }),
        prisma.tenantPayment.aggregate({
          where: { tenantId: { in: tenantIds }, voidedAt: null },
          _sum: { amount: true },
        }),
      ])
      const totalCharged = Number(charges._sum.amount ?? 0)
      const totalPaid = Number(payments._sum.amount ?? 0)
      const balance = totalCharged - totalPaid
      return `Total charged: $${totalCharged.toLocaleString()}\nTotal paid: $${totalPaid.toLocaleString()}\nOutstanding balance: $${balance.toLocaleString()}`
    }

    case 'list_tenant_payments': {
      const where: Record<string, unknown> = {
        tenant: { userId },
      }
      if (a.tenantName) {
        const ids = await findTenantIdsByName(userId, String(a.tenantName))
        where.tenantId = { in: ids }
      }
      if (a.propertyName) {
        where.lease = {
          unit: {
            propertyProfile: {
              project: { userId, type: 'PROPERTY', isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' } },
            },
          },
        }
      }
      if (a.dateFrom || a.dateTo) {
        where.paidDate = {
          ...(a.dateFrom ? { gte: new Date(String(a.dateFrom)) } : {}),
          ...(a.dateTo ? { lte: new Date(String(a.dateTo)) } : {}),
        }
      }
      const payments = await prisma.tenantPayment.findMany({
        where: where as never,
        include: { tenant: { select: { name: true } } },
        orderBy: { paidDate: 'desc' },
        take: 50,
      })
      if (!payments.length) return 'No payments found.'
      return payments.map(p => `${p.paidDate.toISOString().slice(0, 10)} | ${p.tenant.name} | $${Number(p.amount)} | ${p.paymentMethod ?? 'unknown method'}`).join('\n')
    }

    case 'list_overdue_tenants': {
      const propFilter = a.propertyName
        ? { unit: { propertyProfile: { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } } } }
        : { unit: { propertyProfile: { project: { userId, type: 'PROPERTY' as const, isActive: true } } } }
      const leases = await prisma.lease.findMany({
        where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] }, ...propFilter },
        include: {
          tenant: { select: { name: true, email: true } },
          tenantCharges: { where: { forgivenAt: null }, select: { amount: true } },
          tenantPayments: { where: { voidedAt: null }, select: { amount: true } },
          unit: { include: { propertyProfile: { include: { project: { select: { name: true } } } } } },
        },
      })
      const overdue = leases
        .map(l => {
          const charged = l.tenantCharges.reduce((s, c) => s + Number(c.amount), 0)
          const paid = l.tenantPayments.reduce((s, p) => s + Number(p.amount), 0)
          return { name: l.tenant.name, email: l.tenant.email, property: l.unit.propertyProfile.project.name, unit: l.unit.unitLabel, balance: charged - paid }
        })
        .filter(t => t.balance > 0)
        .sort((a, b) => b.balance - a.balance)
      if (!overdue.length) return 'No overdue tenants.'
      return overdue.map(t => `${t.property} / ${t.unit} | ${t.name} | Balance: $${t.balance.toLocaleString()}`).join('\n')
    }

    case 'list_maintenance_requests': {
      const requests = await prisma.maintenanceRequest.findMany({
        where: {
          unit: {
            propertyProfile: a.propertyName
              ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } }
              : { project: { userId, type: 'PROPERTY' as const, isActive: true } },
          },
          ...(a.status ? { status: String(a.status) as never } : {}),
          ...(a.priority ? { priority: String(a.priority) as never } : {}),
        },
        include: {
          unit: { include: { propertyProfile: { include: { project: { select: { name: true } } } } } },
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      if (!requests.length) return 'No maintenance requests found.'
      return requests.map(m => `${m.unit.propertyProfile.project.name} / ${m.unit.unitLabel} | ${m.priority} | ${m.status} | ${m.title} | Tenant: ${m.tenant?.name ?? 'n/a'} | ${m.createdAt.toISOString().slice(0, 10)}`).join('\n')
    }

    case 'get_property_revenue': {
      const where: Record<string, unknown> = {
        tenant: { userId },
        voidedAt: null,
      }
      if (a.propertyName) {
        where.lease = {
          unit: {
            propertyProfile: {
              project: { userId, type: 'PROPERTY', isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' } },
            },
          },
        }
      }
      if (a.dateFrom || a.dateTo) {
        where.paidDate = {
          ...(a.dateFrom ? { gte: new Date(String(a.dateFrom)) } : {}),
          ...(a.dateTo ? { lte: new Date(String(a.dateTo)) } : {}),
        }
      }
      const agg = await prisma.tenantPayment.aggregate({
        where: where as never,
        _sum: { amount: true },
        _count: { id: true },
      })
      return `Total payments received: $${Number(agg._sum.amount ?? 0).toLocaleString()} across ${agg._count.id} payment(s).`
    }

    case 'get_vacancy_cost': {
      const units = await prisma.unit.findMany({
        where: {
          status: 'VACANT',
          propertyProfile: a.propertyName
            ? { project: { userId, type: 'PROPERTY' as const, isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' as const } } }
            : { project: { userId, type: 'PROPERTY' as const, isActive: true } },
        },
        include: { propertyProfile: { include: { project: { select: { name: true } } } } },
      })
      if (!units.length) return 'No vacant units found.'
      const monthlyLost = units.filter(u => u.monthlyRent).reduce((s, u) => s + Number(u.monthlyRent), 0)
      const rows = units.map(u => `${u.propertyProfile.project.name} / ${u.unitLabel} | $${u.monthlyRent ? Number(u.monthlyRent) : 0}/mo`)
      return `${rows.join('\n')}\n\nTotal monthly revenue lost to vacancies: $${monthlyLost.toLocaleString()}`
    }

    case 'list_unit_messages': {
      const limit = typeof a.limit === 'number' ? a.limit : 20
      const tenantIds = a.tenantName ? await findTenantIdsByName(userId, String(a.tenantName)) : undefined
      const messages = await prisma.message.findMany({
        where: {
          tenant: { userId },
          ...(tenantIds ? { tenantId: { in: tenantIds } } : {}),
          ...(a.isRead !== undefined ? { isRead: Boolean(a.isRead) } : {}),
          ...(a.propertyName ? {
            unit: {
              propertyProfile: {
                project: { userId, type: 'PROPERTY', isActive: true, name: { contains: String(a.propertyName), mode: 'insensitive' } },
              },
            },
          } : {}),
        },
        include: {
          tenant: { select: { name: true } },
          unit: { include: { propertyProfile: { include: { project: { select: { name: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      if (!messages.length) return 'No messages found.'
      return messages.map(m =>
        `${m.createdAt.toISOString().slice(0, 10)} | ${m.senderRole === 'tenant' ? `Tenant: ${m.tenant.name}` : 'Owner'} → ${m.senderRole === 'tenant' ? 'Owner' : `Tenant: ${m.tenant.name}`} | Subject: ${m.subject ?? '(none)'} | ${m.isRead ? 'read' : 'UNREAD'}\n  ${m.body.slice(0, 300)}`
      ).join('\n\n')
    }

    default:
      return `Unknown tool: ${toolName}`
  }
}
