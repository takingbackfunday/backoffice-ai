import { prisma } from '@/lib/prisma'
import type { ToolDefinition } from '@/lib/llm/openrouter'

// ── Tool Definitions ────────────────────────────────────────────────────────

export const STUDIO_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_clients',
      description: 'List all CLIENT projects for this user with contact info and outstanding balance.',
      parameters: {
        type: 'object',
        properties: {
          searchName: { type: 'string', description: 'Optional partial name/company filter' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_client',
      description: 'Fuzzy-find a single client by name or company. Use this when the user refers to a client by name before creating an invoice.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name or company to search for (partial match)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: 'List invoices, optionally filtered by client or status.',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: 'Filter by project ID (optional)' },
          status: {
            type: 'string',
            enum: ['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'],
            description: 'Filter by invoice status (optional). OVERDUE means SENT and past due date.',
          },
          limit: { type: 'number', description: 'Max number of invoices to return (default 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Create a new invoice for a client with line items. Use find_client first to resolve the client ID.',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: 'Project ID of the client' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
              },
              required: ['description', 'quantity', 'unitPrice'],
            },
            description: 'Invoice line items',
          },
          dueDate: { type: 'string', description: 'ISO date string (YYYY-MM-DD). If omitted, uses client payment terms.' },
          notes: { type: 'string', description: 'Optional notes on the invoice' },
          jobId: { type: 'string', description: 'Optional job ID to associate this invoice with' },
        },
        required: ['clientId', 'lineItems'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_invoice',
      description: 'Send an invoice by email to the client. Updates status to SENT if DRAFT.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID to send' },
        },
        required: ['invoiceId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_payment',
      description: 'Record a payment received on an invoice. Auto-updates status to PARTIAL or PAID.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID' },
          amount: { type: 'number', description: 'Payment amount' },
          paidDate: { type: 'string', description: 'ISO date string (YYYY-MM-DD), defaults to today' },
          paymentMethod: { type: 'string', description: 'e.g. "bank transfer", "PayPal", "cash"' },
        },
        required: ['invoiceId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding_summary',
      description: 'Get a summary of all outstanding invoices: total outstanding, overdue count/total, and breakdown by client.',
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
      name: 'send_reminder',
      description: 'Send a polite payment reminder email for an overdue or unpaid invoice.',
      parameters: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string', description: 'Invoice ID to remind about' },
        },
        required: ['invoiceId'],
      },
    },
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function invoiceTotal(lineItems: { quantity: unknown; unitPrice: unknown }[]): number {
  return lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
}

function invoicePaid(payments: { amount: unknown }[]): number {
  return payments.reduce((s, p) => s + Number(p.amount), 0)
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function dispatchStudioTool(userId: string, name: string, args: unknown): Promise<string> {
  const a = args as Record<string, unknown>

  switch (name) {

    case 'list_clients': {
      const search = (a.searchName as string | undefined)?.toLowerCase()
      const projects = await prisma.project.findMany({
        where: { userId, type: 'CLIENT', isActive: true },
        include: {
          clientProfile: {
            include: {
              invoices: { include: { lineItems: true, payments: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      const filtered = projects.filter(p => {
        if (!search) return true
        return p.name.toLowerCase().includes(search) ||
          (p.clientProfile?.company ?? '').toLowerCase().includes(search) ||
          (p.clientProfile?.contactName ?? '').toLowerCase().includes(search)
      })

      const clients = filtered.map(p => {
        const profile = p.clientProfile
        const outstanding = (profile?.invoices ?? [])
          .filter(i => i.status !== 'VOID' && i.status !== 'PAID')
          .reduce((s, i) => s + invoiceTotal(i.lineItems) - invoicePaid(i.payments), 0)
        return {
          id: p.id,
          name: p.name,
          company: profile?.company ?? null,
          contactName: profile?.contactName ?? null,
          email: profile?.email ?? null,
          currency: profile?.currency ?? 'USD',
          paymentTermDays: profile?.paymentTermDays ?? 30,
          outstanding: Math.round(outstanding * 100) / 100,
        }
      })

      return JSON.stringify(clients)
    }

    case 'find_client': {
      const name = ((a.name as string) ?? '').toLowerCase()
      const projects = await prisma.project.findMany({
        where: { userId, type: 'CLIENT', isActive: true },
        include: { clientProfile: true },
      })

      const scored = projects
        .map(p => {
          const n = p.name.toLowerCase()
          const co = (p.clientProfile?.company ?? '').toLowerCase()
          const cn = (p.clientProfile?.contactName ?? '').toLowerCase()
          const score = n.includes(name) ? 3 : co.includes(name) ? 2 : cn.includes(name) ? 1 : 0
          return { p, score }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)

      if (scored.length === 0) return JSON.stringify({ error: `No client found matching "${a.name}"` })
      const best = scored[0].p
      return JSON.stringify({
        id: best.id,
        name: best.name,
        company: best.clientProfile?.company ?? null,
        contactName: best.clientProfile?.contactName ?? null,
        email: best.clientProfile?.email ?? null,
        currency: best.clientProfile?.currency ?? 'USD',
        paymentTermDays: best.clientProfile?.paymentTermDays ?? 30,
      })
    }

    case 'list_invoices': {
      const clientId = a.clientId as string | undefined
      const statusFilter = a.status as string | undefined
      const limit = (a.limit as number | undefined) ?? 20
      const now = new Date()

      const invoices = await prisma.invoice.findMany({
        where: {
          clientProfile: {
            project: {
              userId,
              ...(clientId ? { id: clientId } : {}),
            },
          },
        },
        include: {
          job: { select: { id: true, name: true } },
          lineItems: true,
          payments: true,
          clientProfile: { include: { project: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      const rows = invoices.map(inv => {
        const total = invoiceTotal(inv.lineItems)
        const paid = invoicePaid(inv.payments)
        const isOverdue = inv.status !== 'PAID' && inv.status !== 'VOID' && new Date(inv.dueDate) < now
        const displayStatus = isOverdue && inv.status === 'SENT' ? 'OVERDUE' : inv.status
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: displayStatus,
          total,
          paid,
          balance: Math.round((total - paid) * 100) / 100,
          dueDate: inv.dueDate.toISOString().slice(0, 10),
          clientName: inv.clientProfile.project.name,
          clientId: inv.clientProfile.project.id,
          jobName: inv.job?.name ?? null,
          currency: inv.currency,
        }
      })

      const filtered = statusFilter ? rows.filter(r => r.status === statusFilter) : rows
      return JSON.stringify(filtered)
    }

    case 'create_invoice': {
      const clientId = a.clientId as string
      const lineItems = a.lineItems as { description: string; quantity: number; unitPrice: number }[]
      const notesArg = a.notes as string | undefined
      const jobId = a.jobId as string | undefined

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: clientId, userId, type: 'CLIENT' },
        include: { clientProfile: true },
      })
      if (!project || !project.clientProfile) {
        return JSON.stringify({ error: 'Client not found or access denied' })
      }

      // Compute due date
      let dueDate: Date
      if (a.dueDate) {
        dueDate = new Date(a.dueDate as string)
      } else {
        const termDays = project.clientProfile.paymentTermDays
        dueDate = new Date()
        dueDate.setDate(dueDate.getDate() + termDays)
      }

      // Auto-generate invoice number
      const count = await prisma.invoice.count({
        where: { clientProfile: { project: { userId } } },
      })
      const invoiceNumber = `INV-${String(count + 1).padStart(4, '0')}`

      // Validate job if provided
      if (jobId) {
        const job = await prisma.job.findFirst({
          where: { id: jobId, clientProfileId: project.clientProfile.id },
        })
        if (!job) return JSON.stringify({ error: 'Job not found for this client' })
      }

      const invoice = await prisma.invoice.create({
        data: {
          clientProfileId: project.clientProfile.id,
          jobId: jobId ?? null,
          invoiceNumber,
          dueDate,
          currency: project.clientProfile.currency,
          notes: notesArg,
          lineItems: {
            create: lineItems.map(i => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
            })),
          },
        },
        include: { lineItems: true },
      })

      const total = invoiceTotal(invoice.lineItems)
      return JSON.stringify({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        total,
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        clientName: project.name,
        clientEmail: project.clientProfile.email ?? null,
        currency: invoice.currency,
      })
    }

    case 'send_invoice': {
      const invoiceId = a.invoiceId as string

      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, clientProfile: { project: { userId } } },
        include: {
          lineItems: true,
          payments: true,
          clientProfile: { include: { project: { select: { id: true, name: true, slug: true } } } },
        },
      })
      if (!invoice) return JSON.stringify({ error: 'Invoice not found' })

      const clientEmail = invoice.clientProfile.email
      if (!clientEmail) return JSON.stringify({ error: 'Client has no email address on file' })

      const total = invoiceTotal(invoice.lineItems)
      const paid = invoicePaid(invoice.payments)
      const balance = total - paid

      // Send email
      const { sendInvoiceEmail } = await import('@/lib/email')
      await sendInvoiceEmail({
        toEmail: clientEmail,
        toName: invoice.clientProfile.contactName ?? invoice.clientProfile.project.name,
        fromName: invoice.clientProfile.project.name,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        projectSlug: invoice.clientProfile.project.slug,
        total,
        dueDate: invoice.dueDate.toISOString(),
        currency: invoice.currency,
        notes: invoice.notes ?? null,
      })

      // Update status to SENT if DRAFT
      if (invoice.status === 'DRAFT') {
        await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'SENT' } })
      }

      return JSON.stringify({
        sent: true,
        to: clientEmail,
        invoiceNumber: invoice.invoiceNumber,
        total,
      })
    }

    case 'record_payment': {
      const invoiceId = a.invoiceId as string
      const amount = a.amount as number
      const paidDate = a.paidDate ? new Date(a.paidDate as string) : new Date()
      const paymentMethod = a.paymentMethod as string | undefined

      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, clientProfile: { project: { userId } } },
        include: { lineItems: true, payments: true },
      })
      if (!invoice) return JSON.stringify({ error: 'Invoice not found' })
      if (invoice.status === 'VOID') return JSON.stringify({ error: 'Cannot record payment on a voided invoice' })

      const total = invoiceTotal(invoice.lineItems)
      const alreadyPaid = invoicePaid(invoice.payments)

      await prisma.$transaction(async tx => {
        await tx.invoicePayment.create({
          data: { invoiceId, amount, paidDate, paymentMethod },
        })
        const newPaid = alreadyPaid + amount
        const newStatus = newPaid >= total - 0.001 ? 'PAID' : 'PARTIAL'
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } })
      })

      const newTotal = alreadyPaid + amount
      return JSON.stringify({
        recorded: true,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amountRecorded: amount,
        totalPaid: Math.round(newTotal * 100) / 100,
        newStatus: newTotal >= total - 0.001 ? 'PAID' : 'PARTIAL',
      })
    }

    case 'get_outstanding_summary': {
      const now = new Date()
      const projects = await prisma.project.findMany({
        where: { userId, type: 'CLIENT' },
        include: {
          clientProfile: {
            include: {
              invoices: { include: { lineItems: true, payments: true } },
            },
          },
        },
      })

      let totalOutstanding = 0
      let overdueCount = 0
      let overdueTotal = 0
      const byClient: { clientName: string; outstanding: number; overdueAmount: number }[] = []

      for (const p of projects) {
        let clientOutstanding = 0
        let clientOverdue = 0

        for (const inv of p.clientProfile?.invoices ?? []) {
          if (inv.status === 'VOID' || inv.status === 'PAID') continue
          const total = invoiceTotal(inv.lineItems)
          const paid = invoicePaid(inv.payments)
          const balance = total - paid
          clientOutstanding += balance
          const isOverdue = new Date(inv.dueDate) < now
          if (isOverdue) { overdueCount++; overdueTotal += balance; clientOverdue += balance }
        }

        if (clientOutstanding > 0) {
          byClient.push({
            clientName: p.name,
            outstanding: Math.round(clientOutstanding * 100) / 100,
            overdueAmount: Math.round(clientOverdue * 100) / 100,
          })
          totalOutstanding += clientOutstanding
        }
      }

      return JSON.stringify({
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        overdueCount,
        overdueTotal: Math.round(overdueTotal * 100) / 100,
        byClient: byClient.sort((a, b) => b.outstanding - a.outstanding),
      })
    }

    case 'send_reminder': {
      const invoiceId = a.invoiceId as string

      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, clientProfile: { project: { userId } } },
        include: {
          lineItems: true,
          payments: true,
          clientProfile: { include: { project: { select: { name: true, slug: true } } } },
        },
      })
      if (!invoice) return JSON.stringify({ error: 'Invoice not found' })

      const clientEmail = invoice.clientProfile.email
      if (!clientEmail) return JSON.stringify({ error: 'Client has no email address on file' })

      const total = invoiceTotal(invoice.lineItems)
      const paid = invoicePaid(invoice.payments)
      const balance = total - paid

      const isOverdue = new Date(invoice.dueDate) < new Date()
      const { sendReminderEmail } = await import('@/lib/email')
      await sendReminderEmail({
        toEmail: clientEmail,
        toName: invoice.clientProfile.contactName ?? invoice.clientProfile.project.name,
        fromName: invoice.clientProfile.project.name,
        invoiceNumber: invoice.invoiceNumber,
        invoiceId: invoice.id,
        projectSlug: invoice.clientProfile.project.slug,
        balance,
        dueDate: invoice.dueDate.toISOString(),
        currency: invoice.currency,
        isOverdue,
      })

      return JSON.stringify({
        reminded: true,
        to: clientEmail,
        invoiceNumber: invoice.invoiceNumber,
        balance,
      })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
