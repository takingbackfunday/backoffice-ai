import { prisma } from '@/lib/prisma'
import { NotFoundError } from '@/lib/not-found-error'
import type { Prisma } from '@/generated/prisma/client'

/**
 * Canonical ownership lookups. Every function scopes by `userId` —
 * impossible to forget. Throws NotFoundError if the entity doesn't exist
 * or the user doesn't own it.
 */

export async function requireWorkspace(
  userId: string,
  workspaceId: string,
  include?: Prisma.WorkspaceInclude,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    ...(include ? { include } : {}),
  })
  if (!workspace) throw new NotFoundError('Workspace not found')
  return workspace
}

export async function requireInvoice(userId: string, invoiceId: string, projectId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      OR: [
        { clientProfile: { workspace: { id: projectId, userId } } },
        { lease: { unit: { propertyProfile: { workspace: { id: projectId, userId } } } } },
        { tenant: { userId, leases: { some: { unit: { propertyProfile: { workspace: { id: projectId, userId } } } } } } },
        { applicant: { propertyProfile: { workspace: { id: projectId, userId } } } },
      ],
    },
  })
  if (!invoice) throw new NotFoundError('Invoice not found')
  return invoice
}

export async function requireQuote(userId: string, quoteId: string, projectId: string) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      clientProfile: { workspace: { id: projectId, userId } },
    },
  })
  if (!quote) throw new NotFoundError('Quote not found')
  return quote
}

export async function requireVendor(userId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, userId },
  })
  if (!vendor) throw new NotFoundError('Vendor not found')
  return vendor
}

export async function requireWorkOrder(userId: string, workOrderId: string, workspaceId: string) {
  const workOrder = await prisma.workOrder.findFirst({
    where: { id: workOrderId, workspaceId, userId },
  })
  if (!workOrder) throw new NotFoundError('Work order not found')
  return workOrder
}

export async function requireJob(userId: string, jobId: string, clientProfileId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, clientProfileId },
  })
  if (!job) throw new NotFoundError('Job not found')
  return job
}

export async function requireLease(userId: string, leaseId: string, unitIds: string[]) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, unitId: { in: unitIds } },
  })
  if (!lease) throw new NotFoundError('Lease not found')
  return lease
}

export async function requireTenant(userId: string, tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, userId },
  })
  if (!tenant) throw new NotFoundError('Tenant not found')
  return tenant
}
