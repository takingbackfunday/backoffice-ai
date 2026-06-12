import { prisma } from '@/lib/prisma'
import Decimal from 'decimal.js'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface StudioKpis {
  activeClients: number
  openInvoices: number
  totalOutstanding: number
  revenueThisMonth: number
  overdueCount: number
}

export interface ClientCardSummary {
  clientProfileId: string
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  company: string | null
  contactName: string | null
  email: string | null
  currency: string
  paymentTermDays: number
  billingType: string
  outstanding: number
  overdue: number
  collectedPast30: number
  collectedYtd: number
  invoiceCount: number
  acceptedQuoteCount: number
  sentQuoteCount: number
}

/* ------------------------------------------------------------------ */
/*  Studio KPIs — pure SQL aggregation                                 */
/* ------------------------------------------------------------------ */

/**
 * Computes all Studio KPIs in a single SQL pass.
 * Replaces the JS `.flatMap().filter().reduce()` loop that fetched every
 * invoice with all line items and payments.
 */
export async function fetchStudioKpis(userId: string): Promise<StudioKpis> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const nowStr = now.toISOString().slice(0, 10)
  const monthStartStr = startOfMonth.toISOString().slice(0, 10)

  // One query that computes all KPIs at once
  // - activeClients: count of CLIENT workspaces with a clientProfile
  // - openInvoices: derived status in (DRAFT, SENT, PARTIAL)
  // - totalOutstanding: sum of (total - paid) for SENT/PARTIAL
  // - revenueThisMonth: sum of payments this month
  // - overdueCount: derived status = OVERDUE
  const rows = await prisma.$queryRaw<{
    active_clients: bigint
    open_invoices: bigint
    total_outstanding: bigint | null
    revenue_this_month: bigint | null
    overdue_count: bigint
  }[]>`
    WITH client_workspaces AS (
      SELECT cp."id" AS cp_id
      FROM "ClientProfile" cp
      JOIN "Project" w ON w."id" = cp."workspaceId"
      WHERE w."userId" = ${userId} AND w."type" = 'CLIENT' AND w."isActive" = true
    ),
    invoice_agg AS (
      SELECT
        i."clientProfileId",
        i."status" AS stored_status,
        i."issueDate",
        i."dueDate",
        COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END), 0) AS paid
      FROM "Invoice" i
      JOIN "InvoiceLineItem" li ON li."invoiceId" = i."id"
      LEFT JOIN "InvoicePayment" p ON p."invoiceId" = i."id"
      WHERE i."clientProfileId" IN (SELECT cp_id FROM client_workspaces)
      GROUP BY i."id", i."clientProfileId", i."status", i."issueDate", i."dueDate"
    ),
    derived AS (
      SELECT
        *,
        CASE
          WHEN stored_status IN ('VOID', 'DRAFT') THEN stored_status
          WHEN total <= 0 THEN 'VOID'
          WHEN paid >= total THEN 'PAID'
          WHEN paid > 0 THEN 'PARTIAL'
          WHEN dueDate < ${nowStr}::date THEN 'OVERDUE'
          ELSE 'SENT'
        END AS derived_status,
        CASE
          WHEN stored_status IN ('VOID', 'DRAFT') THEN 0
          WHEN total <= 0 THEN 0
          WHEN paid >= total THEN 0
          WHEN paid > 0 THEN total - paid
          WHEN dueDate < ${nowStr}::date THEN total - paid
          ELSE total - paid
        END AS outstanding_amount
      FROM invoice_agg
    ),
    payments_this_month AS (
      SELECT COALESCE(SUM(p."amount"), 0) AS revenue
      FROM "InvoicePayment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      JOIN client_workspaces cw ON cw."cp_id" = i."clientProfileId"
      WHERE p."voidedAt" IS NULL
        AND p."paidDate" >= ${monthStartStr}::date
    )
    SELECT
      (SELECT COUNT(*) FROM client_workspaces) AS active_clients,
      (SELECT COUNT(*) FROM derived WHERE derived_status IN ('DRAFT', 'SENT', 'PARTIAL')) AS open_invoices,
      (SELECT COALESCE(SUM(outstanding_amount), 0) FROM derived WHERE derived_status IN ('SENT', 'PARTIAL')) AS total_outstanding,
      (SELECT revenue FROM payments_this_month) AS revenue_this_month,
      (SELECT COUNT(*) FROM derived WHERE derived_status = 'OVERDUE') AS overdue_count
  `
  const row = rows[0]
  return {
    activeClients: Number(row.active_clients),
    openInvoices: Number(row.open_invoices),
    totalOutstanding: Number(row.total_outstanding ?? 0),
    revenueThisMonth: Number(row.revenue_this_month ?? 0),
    overdueCount: Number(row.overdue_count),
  }
}

/* ------------------------------------------------------------------ */
/*  Client card summaries — per-client aggregates in SQL                */
/* ------------------------------------------------------------------ */

/**
 * Returns summary data for all CLIENT workspace cards.
 * Used to render collapsed card headers (name, company, outstanding, overdue).
 * Invoice/quote detail is loaded lazily on expand.
 */
export async function fetchClientCardSummaries(userId: string): Promise<ClientCardSummary[]> {
  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)
  const thirtyDaysAgoStr = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const yearStartStr = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)

  const rows = await prisma.$queryRaw<{
    client_profile_id: string
    workspace_id: string
    workspace_name: string
    workspace_slug: string
    company: string | null
    contact_name: string | null
    email: string | null
    currency: string
    payment_term_days: number
    billing_type: string
    outstanding: bigint | null
    overdue: bigint | null
    collected_past_30: bigint | null
    collected_ytd: bigint | null
    invoice_count: bigint
    accepted_quote_count: bigint
    sent_quote_count: bigint
  }[]>`
    WITH client_data AS (
      SELECT
        cp."id" AS cp_id,
        w."id" AS ws_id,
        w."name" AS ws_name,
        w."slug" AS ws_slug,
        cp."company",
        cp."contactName",
        cp."email",
        cp."currency",
        cp."paymentTermDays",
        cp."billingType"
      FROM "ClientProfile" cp
      JOIN "Project" w ON w."id" = cp."workspaceId"
      WHERE w."userId" = ${userId} AND w."type" = 'CLIENT' AND w."isActive" = true
    ),
    invoice_data AS (
      SELECT
        i."clientProfileId",
        i."status" AS stored_status,
        i."dueDate",
        i."issueDate",
        COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END), 0) AS paid
      FROM "Invoice" i
      JOIN "InvoiceLineItem" li ON li."invoiceId" = i."id"
      LEFT JOIN "InvoicePayment" p ON p."invoiceId" = i."id"
      WHERE i."clientProfileId" IN (SELECT cp_id FROM client_data)
      GROUP BY i."id", i."clientProfileId", i."status", i."dueDate", i."issueDate"
    ),
    derived_invoices AS (
      SELECT
        *,
        CASE
          WHEN stored_status IN ('VOID', 'DRAFT') THEN stored_status
          WHEN total <= 0 THEN 'VOID'
          WHEN paid >= total THEN 'PAID'
          WHEN paid > 0 THEN 'PARTIAL'
          WHEN dueDate < ${nowStr}::date THEN 'OVERDUE'
          ELSE 'SENT'
        END AS derived_status
      FROM invoice_data
    )
    SELECT
      cd.cp_id AS client_profile_id,
      cd.ws_id AS workspace_id,
      cd.ws_name AS workspace_name,
      cd.ws_slug AS workspace_slug,
      cd.company,
      cd.contact_name,
      cd.email,
      cd.currency,
      cd.payment_term_days,
      cd.billing_type,
      COALESCE(SUM(CASE WHEN di.derived_status IN ('SENT', 'PARTIAL') THEN di.total - di.paid ELSE 0 END), 0) AS outstanding,
      COALESCE(SUM(CASE WHEN di.derived_status = 'OVERDUE' THEN di.total - di.paid ELSE 0 END), 0) AS overdue,
      COALESCE(SUM(CASE WHEN di.derived_status = 'PAID' AND di.issueDate >= ${thirtyDaysAgoStr}::date THEN di.paid ELSE 0 END), 0) AS collected_past_30,
      COALESCE(SUM(CASE WHEN di.derived_status = 'PAID' AND di.issueDate >= ${yearStartStr}::date THEN di.paid ELSE 0 END), 0) AS collected_ytd,
      COUNT(DISTINCT di."id") AS invoice_count,
      (SELECT COUNT(*) FROM "Quote" q WHERE q."clientProfileId" = cd.cp_id AND q."status" = 'ACCEPTED') AS accepted_quote_count,
      (SELECT COUNT(*) FROM "Quote" q WHERE q."clientProfileId" = cd.cp_id AND q."status" = 'SENT') AS sent_quote_count
    FROM client_data cd
    LEFT JOIN derived_invoices di ON di."clientProfileId" = cd.cp_id
    GROUP BY cd.cp_id, cd.ws_id, cd.ws_name, cd.ws_slug, cd.company, cd.contact_name, cd.email, cd.currency, cd.payment_term_days, cd.billing_type
    ORDER BY cd.ws_name ASC
  `

  return rows.map(r => ({
    clientProfileId: r.client_profile_id,
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    workspaceSlug: r.workspace_slug,
    company: r.company,
    contactName: r.contact_name,
    email: r.email,
    currency: r.currency,
    paymentTermDays: r.payment_term_days,
    billingType: r.billing_type,
    outstanding: Number(r.outstanding ?? 0),
    overdue: Number(r.overdue ?? 0),
    collectedPast30: Number(r.collected_past_30 ?? 0),
    collectedYtd: Number(r.collected_ytd ?? 0),
    invoiceCount: Number(r.invoice_count),
    acceptedQuoteCount: Number(r.accepted_quote_count),
    sentQuoteCount: Number(r.sent_quote_count),
  }))
}

/* ------------------------------------------------------------------ */
/*  Lightweight quotes — for notices                                    */
/* ------------------------------------------------------------------ */

export interface LightweightQuote {
  id: string
  quoteNumber: string
  title: string
  totalQuoted: number | null
  currency: string
  status: string
  sentAt: string | null
  hasInvoice: boolean
  jobName: string | null
  clientProfileId: string
  clientName: string
  clientSlug: string
}

/**
 * Fetches accepted/sent quotes with minimal data for the notices strip.
 * No line items — just enough to display notice text.
 */
export async function fetchLightweightQuotes(userId: string): Promise<LightweightQuote[]> {
  const rows = await prisma.$queryRaw<{
    id: string
    quote_number: string
    title: string
    total_quoted: bigint | null
    currency: string
    status: string
    sent_at: Date | null
    has_invoice: boolean
    job_name: string | null
    client_profile_id: string
    client_name: string
    client_slug: string
  }[]>`
    SELECT
      q."id",
      q."quoteNumber" AS quote_number,
      q."title",
      q."totalQuoted" AS total_quoted,
      q."currency",
      q."status",
      q."sentAt" AS sent_at,
      EXISTS(SELECT 1 FROM "Invoice" inv WHERE inv."quoteId" = q."id") AS has_invoice,
      j."name" AS job_name,
      cp."id" AS client_profile_id,
      w."name" AS client_name,
      w."slug" AS client_slug
    FROM "Quote" q
    JOIN "ClientProfile" cp ON cp."id" = q."clientProfileId"
    JOIN "Project" w ON w."id" = cp."workspaceId"
    LEFT JOIN "Job" j ON j."id" = q."jobId"
    WHERE w."userId" = ${userId} AND w."type" = 'CLIENT' AND w."isActive" = true
      AND q."status" IN ('ACCEPTED', 'SENT')
    ORDER BY q."createdAt" DESC
  `

  return rows.map(r => ({
    id: r.id,
    quoteNumber: r.quote_number,
    title: r.title,
    totalQuoted: r.total_quoted ? Number(r.total_quoted) : null,
    currency: r.currency,
    status: r.status,
    sentAt: r.sent_at?.toISOString() ?? null,
    hasInvoice: r.has_invoice,
    jobName: r.job_name,
    clientProfileId: r.client_profile_id,
    clientName: r.client_name,
    clientSlug: r.client_slug,
  }))
}

/* ------------------------------------------------------------------ */
/*  Client detail (lazy-loaded on card expand)                         */
/* ------------------------------------------------------------------ */

export interface ClientDetailInvoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  total: number
  paid: number
  jobName: string | null
}

export interface ClientDetailQuote {
  id: string
  quoteNumber: string
  title: string
  totalQuoted: number | null
  currency: string
  hasInvoice: boolean
  sentAt: string | null
  jobName: string | null
  status: string
}

export interface ClientDetailJob {
  id: string
  name: string
}

export interface ClientDetail {
  invoices: ClientDetailInvoice[]
  acceptedQuotes: ClientDetailQuote[]
  sentQuotes: ClientDetailQuote[]
  jobs: ClientDetailJob[]
  receiptCount: number
}

/**
 * Fetches expanded card detail for a single client.
 * Called on card expand instead of being pre-serialized for all clients.
 */
export async function fetchClientDetail(userId: string, clientProfileId: string): Promise<ClientDetail> {
  const profile = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, workspace: { userId, type: 'CLIENT' } },
    include: {
      jobs: { where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!profile) return { invoices: [], acceptedQuotes: [], sentQuotes: [], jobs: [], receiptCount: 0 }

  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)

  const invoices = await prisma.$queryRaw<{
    id: string
    invoice_number: string
    stored_status: string
    issue_date: Date
    due_date: Date
    currency: string
    total: bigint
    paid: bigint
    job_name: string | null
  }[]>`
    SELECT
      i."id",
      i."invoiceNumber" AS invoice_number,
      i."status" AS stored_status,
      i."issueDate" AS issue_date,
      i."dueDate" AS due_date,
      i."currency",
      COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
      COALESCE((SELECT SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END) FROM "InvoicePayment" p WHERE p."invoiceId" = i."id"), 0) AS paid,
      j."name" AS job_name
    FROM "Invoice" i
    LEFT JOIN "InvoiceLineItem" li ON li."invoiceId" = i."id"
    LEFT JOIN "Job" j ON j."id" = i."jobId"
    WHERE i."clientProfileId" = ${clientProfileId}
    GROUP BY i."id", i."invoiceNumber", i."status", i."issueDate", i."dueDate", i."currency", j."name"
    ORDER BY i."createdAt" DESC
  `

  const derivedInvoices: ClientDetailInvoice[] = invoices.map(inv => {
    const total = new Decimal(String(inv.total))
    const paid = new Decimal(String(inv.paid))
    const stored = inv.stored_status

    let derivedStatus: string
    if (stored === 'VOID' || stored === 'DRAFT') {
      derivedStatus = stored
    } else if (total.lte(0)) {
      derivedStatus = 'VOID'
    } else if (paid.gte(total)) {
      derivedStatus = 'PAID'
    } else if (paid.gt(0)) {
      derivedStatus = 'PARTIAL'
    } else {
      const dueStr = inv.due_date.toISOString().slice(0, 10)
      derivedStatus = dueStr < nowStr ? 'OVERDUE' : 'SENT'
    }

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      status: derivedStatus,
      issueDate: inv.issue_date.toISOString(),
      dueDate: inv.due_date.toISOString(),
      currency: inv.currency,
      total: total.toNumber(),
      paid: paid.toNumber(),
      jobName: inv.job_name,
    }
  })

  const quotes = await prisma.quote.findMany({
    where: { clientProfileId: clientProfileId, status: { in: ['ACCEPTED', 'SENT'] } },
    select: {
      id: true,
      quoteNumber: true,
      title: true,
      totalQuoted: true,
      currency: true,
      status: true,
      sentAt: true,
      job: { select: { name: true } },
      _count: { select: { invoices: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const acceptedQuotes = quotes
    .filter(q => q.status === 'ACCEPTED')
    .map(q => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      title: q.title,
      totalQuoted: q.totalQuoted ? Number(q.totalQuoted) : null,
      currency: q.currency,
      hasInvoice: q._count.invoices > 0,
      sentAt: q.sentAt?.toISOString() ?? null,
      jobName: q.job?.name ?? null,
      status: q.status,
    }))

  const sentQuotes = quotes
    .filter(q => q.status === 'SENT')
    .map(q => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      title: q.title,
      totalQuoted: q.totalQuoted ? Number(q.totalQuoted) : null,
      currency: q.currency,
      hasInvoice: q._count.invoices > 0,
      sentAt: q.sentAt?.toISOString() ?? null,
      jobName: q.job?.name ?? null,
      status: q.status,
    }))

  const workspaceId = profile.workspaceId
  const receiptRows = await prisma.receipt.groupBy({
    by: ['workspaceId'],
    where: { userId, workspaceId },
    _count: { id: true },
  })
  const receiptCount = receiptRows[0]?._count.id ?? 0

  return {
    invoices: derivedInvoices,
    acceptedQuotes,
    sentQuotes,
    jobs: profile.jobs,
    receiptCount,
  }
}

/* ------------------------------------------------------------------ */
/*  Lightweight invoices — for notices, pipeline, activity              */
/* ------------------------------------------------------------------ */

export interface LightweightInvoice {
  id: string
  invoiceNumber: string
  status: string // derived status
  issueDate: string
  dueDate: string
  currency: string
  total: number
  paid: number
  jobName: string | null
  clientId: string // workspace ID, used for card filtering
  clientProfileId: string
  clientName: string
  clientSlug: string
  clientCompany: string | null
}

/**
 * Fetches invoices with pre-computed totals but without line items or payments.
 * Used by the client component for notices, pipeline strip, and recent activity.
 * No per-invoice line-item fetch at initial load.
 */
export async function fetchLightweightInvoices(userId: string): Promise<LightweightInvoice[]> {
  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)

  const rows = await prisma.$queryRaw<{
    id: string
    invoice_number: string
    stored_status: string
    issue_date: Date
    due_date: Date
    currency: string
    total: bigint
    paid: bigint
    job_name: string | null
    workspace_id: string
    client_profile_id: string
    client_name: string
    client_slug: string
    client_company: string | null
  }[]>`
    SELECT
      i."id",
      i."invoiceNumber" AS invoice_number,
      i."status" AS stored_status,
      i."issueDate" AS issue_date,
      i."dueDate" AS due_date,
      i."currency",
      COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
      COALESCE((SELECT SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END) FROM "InvoicePayment" p WHERE p."invoiceId" = i."id"), 0) AS paid,
      j."name" AS job_name,
      w."id" AS workspace_id,
      cp."id" AS client_profile_id,
      w."name" AS client_name,
      w."slug" AS client_slug,
      cp."company" AS client_company
    FROM "Invoice" i
    JOIN "ClientProfile" cp ON cp."id" = i."clientProfileId"
    JOIN "Project" w ON w."id" = cp."workspaceId"
    LEFT JOIN "InvoiceLineItem" li ON li."invoiceId" = i."id"
    LEFT JOIN "Job" j ON j."id" = i."jobId"
    WHERE w."userId" = ${userId} AND w."type" = 'CLIENT' AND w."isActive" = true
    GROUP BY i."id", i."invoiceNumber", i."status", i."issueDate", i."dueDate", i."currency",
             j."name", w."id", cp."id", w."name", w."slug", cp."company"
    ORDER BY i."createdAt" DESC
  `

  return rows.map(inv => {
    const total = new Decimal(String(inv.total))
    const paid = new Decimal(String(inv.paid))
    const stored = inv.stored_status

    let derivedStatus: string
    if (stored === 'VOID' || stored === 'DRAFT') {
      derivedStatus = stored
    } else if (total.lte(0)) {
      derivedStatus = 'VOID'
    } else if (paid.gte(total)) {
      derivedStatus = 'PAID'
    } else if (paid.gt(0)) {
      derivedStatus = 'PARTIAL'
    } else {
      const dueStr = inv.due_date.toISOString().slice(0, 10)
      derivedStatus = dueStr < nowStr ? 'OVERDUE' : 'SENT'
    }

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      status: derivedStatus,
      issueDate: inv.issue_date.toISOString(),
      dueDate: inv.due_date.toISOString(),
      currency: inv.currency,
      total: total.toNumber(),
      paid: paid.toNumber(),
      jobName: inv.job_name,
      clientId: inv.workspace_id,
      clientProfileId: inv.client_profile_id,
      clientName: inv.client_name,
      clientSlug: inv.client_slug,
      clientCompany: inv.client_company,
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Portfolio KPIs — pure SQL aggregation                               */
/* ------------------------------------------------------------------ */

export interface PortfolioKpis {
  totalUnits: number
  leasedUnits: number
  vacantUnits: number
  openMaintenance: number
  monthlyRevenue: number
  expiringLeases: number
  unreadMessages: number
  overduePayments: number
}

/**
 * Computes all Portfolio KPIs in a single SQL pass.
 * Replaces the JS iteration over all units/leases/invoices.
 */
export async function fetchPortfolioKpis(userId: string): Promise<PortfolioKpis> {
  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)
  const in90DaysStr = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)

  const rows = await prisma.$queryRaw<{
    total_units: bigint
    leased_units: bigint
    vacant_units: bigint
    open_maintenance: bigint
    monthly_revenue: bigint | null
    expiring_leases: bigint
    unread_messages: bigint
    overdue_payments: bigint
  }[]>`
    WITH property_workspaces AS (
      SELECT pp."id" AS pp_id, pp."workspaceId" AS ws_id
      FROM "PropertyProfile" pp
      JOIN "Project" w ON w."id" = pp."workspaceId"
      WHERE w."userId" = ${userId} AND w."type" = 'PROPERTY' AND w."isActive" = true
    ),
    all_units AS (
      SELECT u."id", u."status", u."monthlyRent"
      FROM "Unit" u
      JOIN property_workspaces pw ON pw."pp_id" = u."propertyProfileId"
    ),
    active_leases AS (
      SELECT
        l."id",
        l."unitId",
        l."endDate",
        l."monthlyRent",
        l."status" AS lease_status
      FROM "Lease" l
      JOIN all_units au ON au."id" = l."unitId"
      WHERE l."status" IN ('ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH')
    ),
    lease_invoices AS (
      SELECT
        inv."id" AS inv_id,
        inv."leaseId",
        inv."status" AS stored_status,
        inv."dueDate",
        COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
        COALESCE((SELECT SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END) FROM "InvoicePayment" p WHERE p."invoiceId" = inv."id"), 0) AS paid
      FROM "Invoice" inv
      JOIN active_leases al ON al."id" = inv."leaseId"
      LEFT JOIN "InvoiceLineItem" li ON li."invoiceId" = inv."id"
      WHERE inv."status" != 'VOID'
      GROUP BY inv."id", inv."leaseId", inv."status", inv."dueDate"
    ),
    overdue_leases AS (
      SELECT li."leaseId"
      FROM lease_invoices li
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN li.stored_status IN ('VOID', 'DRAFT') THEN li.stored_status
            WHEN li.total <= 0 THEN 'VOID'
            WHEN li.paid >= li.total THEN 'PAID'
            WHEN li.paid > 0 THEN 'PARTIAL'
            WHEN li.dueDate < ${nowStr}::date THEN 'OVERDUE'
            ELSE 'SENT'
          END AS derived_status,
          CASE
            WHEN li.stored_status IN ('VOID', 'DRAFT') THEN 0
            WHEN li.total <= 0 THEN 0
            WHEN li.paid >= li.total THEN 0
            ELSE li.total - li.paid
          END AS balance
      ) ds ON true
      WHERE ds.derived_status = 'OVERDUE' AND ds.balance > 0
    )
    SELECT
      (SELECT COUNT(*) FROM all_units) AS total_units,
      (SELECT COUNT(*) FROM all_units WHERE "status" = 'LEASED') AS leased_units,
      (SELECT COUNT(*) FROM all_units WHERE "status" = 'VACANT') AS vacant_units,
      (SELECT COUNT(*) FROM "MaintenanceRequest" mr
       JOIN all_units au ON au."id" = mr."unitId"
       WHERE mr."status" IN ('OPEN', 'SCHEDULED', 'IN_PROGRESS')) AS open_maintenance,
      (SELECT COALESCE(SUM(al."monthlyRent"), 0) FROM active_leases al
       JOIN all_units au ON au."id" = al."unitId"
       WHERE au."status" = 'LEASED' AND al."monthlyRent" IS NOT NULL) AS monthly_revenue,
      (SELECT COUNT(*) FROM active_leases al
       WHERE al."endDate" IS NOT NULL
         AND al."endDate" >= ${nowStr}::date
         AND al."endDate" <= ${in90DaysStr}::date) AS expiring_leases,
      (SELECT COUNT(*) FROM "Message" m
       JOIN all_units au ON au."id" = m."unitId"
       WHERE m."isRead" = false AND m."senderRole" = 'tenant') AS unread_messages,
      (SELECT COUNT(DISTINCT ol."leaseId") FROM overdue_leases ol) AS overdue_payments
  `

  const row = rows[0]
  return {
    totalUnits: Number(row.total_units),
    leasedUnits: Number(row.leased_units),
    vacantUnits: Number(row.vacant_units),
    openMaintenance: Number(row.open_maintenance),
    monthlyRevenue: Number(row.monthly_revenue ?? 0),
    expiringLeases: Number(row.expiring_leases),
    unreadMessages: Number(row.unread_messages),
    overduePayments: Number(row.overdue_payments),
  }
}

/* ------------------------------------------------------------------ */
/*  Portfolio unit summaries — per-unit data for collapsed cards        */
/* ------------------------------------------------------------------ */

export interface UnitSummary {
  id: string
  unitLabel: string
  status: string
  monthlyRent: number | null
  bedrooms: number | null
  bathrooms: number | null
  squareFootage: number | null
  tenantName: string | null
  tenantId: string | null
  tenantEmail: string | null
  tenantPhone: string | null
  leaseId: string | null
  leaseEndDate: string | null
  leaseStartDate: string | null
  leaseStatus: string | null
  leaseMonthlyRent: number | null
  paymentDueDay: number | null
  openMaintenance: number
  unreadMessages: number
  // Pre-computed payment status for collapsed card rendering
  hasOverdueRent: boolean
  balance: number
  paymentStatusScore: number
  propertyName: string
  propertySlug: string
  propertyId: string
  propertyAddress: string | null
  propertyCity: string | null
  propertyState: string | null
  propertyType: string | null
}

/**
 * Fetches unit summaries for all PROPERTY workspaces.
 * Used to render collapsed unit cards without loading invoices/payments.
 */
export async function fetchUnitSummaries(userId: string): Promise<UnitSummary[]> {
  const rows = await prisma.$queryRaw<{
    unit_id: string
    unit_label: string
    unit_status: string
    monthly_rent: bigint | null
    bedrooms: number | null
    bathrooms: bigint | null
    square_footage: number | null
    tenant_name: string | null
    tenant_id: string | null
    tenant_email: string | null
    tenant_phone: string | null
    lease_id: string | null
    lease_end_date: Date | null
    lease_start_date: Date | null
    lease_status: string | null
    lease_monthly_rent: bigint | null
    payment_due_day: number | null
    open_maintenance: bigint
    unread_messages: bigint
    has_overdue_rent: boolean
    balance: bigint
    payment_status_score: number
    property_name: string
    property_slug: string
    property_id: string
    property_address: string | null
    property_city: string | null
    property_state: string | null
    property_type: string | null
  }[]>`
    WITH unit_data AS (
      SELECT
        u."id",
        u."unitLabel",
        u."status",
        u."monthlyRent",
        u."bedrooms",
        u."bathrooms",
        u."squareFootage",
        u."propertyProfileId",
        w."name" AS property_name,
        w."slug" AS property_slug,
        w."id" AS property_id,
        pp."address" AS property_address,
        pp."city" AS property_city,
        pp."state" AS property_state,
        pp."propertyType" AS property_type
      FROM "Unit" u
      JOIN "PropertyProfile" pp ON pp."id" = u."propertyProfileId"
      JOIN "Project" w ON w."id" = pp."workspaceId"
      WHERE w."userId" = ${userId} AND w."type" = 'PROPERTY' AND w."isActive" = true
    ),
    active_leases AS (
      SELECT DISTINCT ON (l."unitId")
        l."id", l."unitId", l."endDate", l."startDate", l."status", l."monthlyRent", l."paymentDueDay", l."tenantId"
      FROM "Lease" l
      JOIN unit_data ud ON ud."id" = l."unitId"
      WHERE l."status" IN ('ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH')
      ORDER BY l."unitId", l."startDate" DESC
    ),
    invoice_agg AS (
      SELECT
        inv."leaseId",
        inv."status" AS stored_status,
        inv."dueDate",
        COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
        COALESCE((SELECT SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END) FROM "InvoicePayment" p WHERE p."invoiceId" = inv."id"), 0) AS paid
      FROM "Invoice" inv
      JOIN active_leases al ON al."id" = inv."leaseId"
      LEFT JOIN "InvoiceLineItem" li ON li."invoiceId" = inv."id"
      WHERE inv."status" != 'VOID'
      GROUP BY inv."id", inv."leaseId", inv."status", inv."dueDate"
    ),
    derived_invoices AS (
      SELECT
        *,
        CASE
          WHEN stored_status IN ('VOID', 'DRAFT') THEN stored_status
          WHEN total <= 0 THEN 'VOID'
          WHEN paid >= total THEN 'PAID'
          WHEN paid > 0 THEN 'PARTIAL'
          WHEN dueDate < CURRENT_DATE THEN 'OVERDUE'
          ELSE 'SENT'
        END AS derived_status,
        total - paid AS balance
      FROM invoice_agg
    ),
    payment_stats AS (
      SELECT
        di."leaseId",
        SUM(CASE WHEN di.derived_status NOT IN ('VOID') THEN di.total ELSE 0 END) AS charged,
        SUM(CASE WHEN di.derived_status NOT IN ('VOID') THEN di.paid ELSE 0 END) AS paid,
        SUM(CASE WHEN di.derived_status = 'OVERDUE' THEN di.total - di.paid ELSE 0 END) AS overdue_balance,
        MAX(CASE WHEN di.derived_status = 'OVERDUE' THEN di.dueDate END) AS oldest_overdue
      FROM derived_invoices di
      GROUP BY di."leaseId"
    )
    SELECT
      ud."id" AS unit_id,
      ud."unitLabel" AS unit_label,
      ud."status" AS unit_status,
      ud."monthlyRent" AS monthly_rent,
      ud."bedrooms",
      ud."bathrooms",
      ud."squareFootage" AS square_footage,
      t."name" AS tenant_name,
      t."id" AS tenant_id,
      t."email" AS tenant_email,
      t."phone" AS tenant_phone,
      al."id" AS lease_id,
      al."endDate" AS lease_end_date,
      al."startDate" AS lease_start_date,
      al."status" AS lease_status,
      al."monthlyRent" AS lease_monthly_rent,
      al."paymentDueDay" AS payment_due_day,
      (SELECT COUNT(*) FROM "MaintenanceRequest" mr
       WHERE mr."unitId" = ud."id" AND mr."status" IN ('OPEN', 'SCHEDULED', 'IN_PROGRESS')) AS open_maintenance,
      (SELECT COUNT(*) FROM "Message" m
       WHERE m."unitId" = ud."id" AND m."isRead" = false AND m."senderRole" = 'tenant') AS unread_messages,
      COALESCE(ps.overdue_balance > 0, false) AS has_overdue_rent,
      COALESCE(ps.charged - ps.paid, 0) AS balance,
      CASE
        WHEN t."id" IS NULL THEN 0
        WHEN ps.charged = 0 THEN 0
        WHEN ps.charged - ps.paid <= 0 THEN 1
        WHEN ps.paid > 0 AND ps.paid < ps.charged THEN 2
        WHEN ps.oldest_overdue IS NOT NULL AND CURRENT_DATE - ps.oldest_overdue >= 60 THEN 5
        WHEN ps.oldest_overdue IS NOT NULL AND CURRENT_DATE - ps.oldest_overdue >= 30 THEN 4
        WHEN ps.oldest_overdue IS NOT NULL AND CURRENT_DATE - ps.oldest_overdue > 0 THEN 3
        ELSE 2
      END AS payment_status_score,
      ud.property_name,
      ud.property_slug,
      ud.property_id,
      ud.property_address,
      ud.property_city,
      ud.property_state,
      ud.property_type
    FROM unit_data ud
    LEFT JOIN active_leases al ON al."unitId" = ud."id"
    LEFT JOIN "Tenant" t ON t."id" = al."tenantId"
    LEFT JOIN payment_stats ps ON ps."leaseId" = al."id"
    ORDER BY ud.property_name ASC, ud."unitLabel" ASC
  `

  return rows.map(r => ({
    id: r.unit_id,
    unitLabel: r.unit_label,
    status: r.unit_status,
    monthlyRent: r.monthly_rent ? Number(r.monthly_rent) : null,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms ? Number(r.bathrooms) : null,
    squareFootage: r.square_footage,
    tenantName: r.tenant_name,
    tenantId: r.tenant_id,
    tenantEmail: r.tenant_email,
    tenantPhone: r.tenant_phone,
    leaseId: r.lease_id,
    leaseEndDate: r.lease_end_date?.toISOString() ?? null,
    leaseStartDate: r.lease_start_date?.toISOString() ?? null,
    leaseStatus: r.lease_status,
    leaseMonthlyRent: r.lease_monthly_rent ? Number(r.lease_monthly_rent) : null,
    paymentDueDay: r.payment_due_day,
    openMaintenance: Number(r.open_maintenance),
    unreadMessages: Number(r.unread_messages),
    hasOverdueRent: r.has_overdue_rent,
    balance: Number(r.balance ?? 0),
    paymentStatusScore: r.payment_status_score,
    propertyName: r.property_name,
    propertySlug: r.property_slug,
    propertyId: r.property_id,
    propertyAddress: r.property_address,
    propertyCity: r.property_city,
    propertyState: r.property_state,
    propertyType: r.property_type,
  }))
}

/* ------------------------------------------------------------------ */
/*  Unit detail (lazy-loaded on card expand)                           */
/* ------------------------------------------------------------------ */

export interface UnitDetailMaintenance {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  createdAt: string
  tenantName: string | null
  tenantId: string | null
}

export interface UnitDetailInvoice {
  id: string
  invoiceNumber: string
  status: string
  period: string | null
  dueDate: string
  lineItemTotal: number
  paymentTotal: number
}

export interface UnitDetailMessage {
  id: string
  subject: string | null
  body: string | null
  createdAt: string
  isRead: boolean
  senderRole: string
  tenantName: string | null
  tenantId: string | null
}

export interface UnitDetail {
  maintenanceRequests: UnitDetailMaintenance[]
  invoices: UnitDetailInvoice[]
  recentMessages: UnitDetailMessage[]
}

/**
 * Fetches expanded detail for a single unit.
 * Called on card expand instead of being pre-serialized for all units.
 */
export async function fetchUnitDetail(userId: string, unitId: string): Promise<UnitDetail> {
  // Verify ownership
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyProfile: { workspace: { userId, type: 'PROPERTY' } } },
  })
  if (!unit) return { maintenanceRequests: [], invoices: [], recentMessages: [] }

  const [maintenanceRequests, invoices, recentMessages] = await Promise.all([
    prisma.maintenanceRequest.findMany({
      where: { unitId, status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        createdAt: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.$queryRaw<{
      id: string
      invoice_number: string
      stored_status: string
      period: string | null
      due_date: Date
      total: bigint
      paid: bigint
    }[]>`
      SELECT
        inv."id",
        inv."invoiceNumber" AS invoice_number,
        inv."status" AS stored_status,
        inv."period",
        inv."dueDate" AS due_date,
        COALESCE(SUM(CASE WHEN li."forgivenAt" IS NULL THEN li."quantity" * li."unitPrice" ELSE 0 END), 0) AS total,
        COALESCE((SELECT SUM(CASE WHEN p."voidedAt" IS NULL THEN p."amount" ELSE 0 END) FROM "InvoicePayment" p WHERE p."invoiceId" = inv."id"), 0) AS paid
      FROM "Invoice" inv
      LEFT JOIN "InvoiceLineItem" li ON li."invoiceId" = inv."id"
      WHERE inv."leaseId" IN (SELECT "id" FROM "Lease" WHERE "unitId" = ${unitId})
        AND inv."status" != 'VOID'
      GROUP BY inv."id", inv."invoiceNumber", inv."status", inv."period", inv."dueDate"
      ORDER BY inv."dueDate" DESC
      LIMIT 12
    `,
    prisma.message.findMany({
      where: { unitId, isRead: false, senderRole: 'tenant' },
      select: {
        id: true,
        subject: true,
        body: true,
        createdAt: true,
        isRead: true,
        senderRole: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ])

  const now = new Date()
  const nowStr = now.toISOString().slice(0, 10)

  return {
    maintenanceRequests: maintenanceRequests.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      priority: m.priority,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      tenantName: m.tenant?.name ?? null,
      tenantId: m.tenant?.id ?? null,
    })),
    invoices: invoices.map(inv => {
      const total = new Decimal(String(inv.total))
      const paid = new Decimal(String(inv.paid))
      const stored = inv.stored_status

      let derivedStatus: string
      if (stored === 'VOID' || stored === 'DRAFT') {
        derivedStatus = stored
      } else if (total.lte(0)) {
        derivedStatus = 'VOID'
      } else if (paid.gte(total)) {
        derivedStatus = 'PAID'
      } else if (paid.gt(0)) {
        derivedStatus = 'PARTIAL'
      } else {
        const dueStr = inv.due_date.toISOString().slice(0, 10)
        derivedStatus = dueStr < nowStr ? 'OVERDUE' : 'SENT'
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        status: derivedStatus,
        period: inv.period,
        dueDate: inv.due_date.toISOString(),
        lineItemTotal: total.toNumber(),
        paymentTotal: paid.toNumber(),
      }
    }),
    recentMessages: recentMessages.map(m => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      isRead: m.isRead,
      senderRole: m.senderRole,
      tenantName: m.tenant?.name ?? null,
      tenantId: m.tenant?.id ?? null,
    })),
  }
}
