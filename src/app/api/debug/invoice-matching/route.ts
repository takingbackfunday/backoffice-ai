/**
 * DEBUG ONLY — remove after debugging is complete.
 * GET /api/debug/invoice-matching?txId=xxx
 * Runs the matching logic for a specific transaction and returns detailed diagnostics.
 */
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { unauthorized } from '@/lib/api-response'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  const { searchParams } = new URL(request.url)
  const txId = searchParams.get('txId')

  const logs: string[] = []
  const log = (msg: string) => { logs.push(msg); console.log(msg) }

  try {
    if (!txId) {
      // List recent transactions on CLIENT projects for this user
      const recent = await prisma.transaction.findMany({
        where: { project: { userId, type: 'CLIENT' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          amount: true,
          description: true,
          date: true,
          projectId: true,
          project: { select: { name: true, type: true } },
          invoicePayment: { select: { id: true } },
          invoicePaymentSuggestions: { select: { id: true, status: true } },
        },
      })
      return NextResponse.json({ logs, recent })
    }

    // Deep-dive on specific transaction
    const tx = await prisma.transaction.findUnique({
      where: { id: txId },
      include: {
        project: { select: { id: true, name: true, type: true, userId: true } },
        invoicePayment: true,
        invoicePaymentSuggestions: true,
      },
    })

    if (!tx) return NextResponse.json({ logs: ['transaction not found'], tx: null })
    log(`tx.id=${tx.id}`)
    log(`tx.amount=${tx.amount} (positive: ${Number(tx.amount) > 0})`)
    log(`tx.description="${tx.description}"`)
    log(`tx.project=${JSON.stringify(tx.project)}`)
    log(`tx.project.userId === userId: ${tx.project?.userId === userId}`)
    log(`tx.project.type: ${tx.project?.type} (is CLIENT: ${tx.project?.type === 'CLIENT'})`)
    log(`tx.invoicePayment=${tx.invoicePayment ? 'EXISTS (already linked)' : 'null (unlinked)'}`)
    log(`tx.invoicePaymentSuggestions=${JSON.stringify(tx.invoicePaymentSuggestions)}`)

    if (!tx.project || tx.project.type !== 'CLIENT') {
      log('STOP: project is not CLIENT type — matching will be skipped')
      return NextResponse.json({ logs, tx })
    }
    if (tx.project.userId !== userId) {
      log('STOP: project does not belong to this userId')
      return NextResponse.json({ logs, tx })
    }
    if (Number(tx.amount) <= 0) {
      log('STOP: amount is not positive')
      return NextResponse.json({ logs, tx })
    }
    if (tx.invoicePayment) {
      log('STOP: already linked to an InvoicePayment')
      return NextResponse.json({ logs, tx })
    }
    const pendingSugg = tx.invoicePaymentSuggestions.filter(s => s.status === 'PENDING')
    if (pendingSugg.length > 0) {
      log(`STOP: already has ${pendingSugg.length} PENDING suggestion(s)`)
      return NextResponse.json({ logs, tx })
    }

    // Now check the client profile and open invoices
    const clientProfile = await prisma.clientProfile.findUnique({
      where: { projectId: tx.project.id },
      include: {
        invoices: {
          where: { status: { in: ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'] } },
          include: { lineItems: true, payments: true },
        },
      },
    })

    log(`clientProfile=${clientProfile ? clientProfile.id : 'NOT FOUND'}`)
    log(`open invoices (DRAFT/SENT/PARTIAL/OVERDUE): ${clientProfile?.invoices.length ?? 0}`)

    if (!clientProfile || clientProfile.invoices.length === 0) {
      log('STOP: no open invoices for this client — no match possible')
      return NextResponse.json({ logs, clientProfile: clientProfile ? { id: clientProfile.id, invoiceCount: 0 } : null })
    }

    const txAmount = Number(tx.amount)
    const invoicesWithBalance = clientProfile.invoices.map(inv => {
      const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const paid = inv.payments.reduce((s, p) => s + Number(p.amount), 0)
      const balance = total - paid
      log(`  invoice ${inv.invoiceNumber}: total=${total} paid=${paid} balance=${balance} status=${inv.status}${inv.status === 'DRAFT' ? ' [DRAFT — will be MEDIUM only]' : ''} diff_from_tx=${Math.abs(balance - txAmount).toFixed(2)}`)
      return { inv, total, balance }
    })

    const exactMatches = invoicesWithBalance.filter(({ balance }) => Math.abs(balance - txAmount) <= 0.01)
    log(`exactMatches (±0.01): ${exactMatches.length}`)

    return NextResponse.json({ logs, invoicesWithBalance: invoicesWithBalance.map(i => ({ invoiceNumber: i.inv.invoiceNumber, total: i.total, balance: i.balance, status: i.inv.status })) })
  } catch (err) {
    log(`ERROR: ${String(err)}`)
    return NextResponse.json({ logs, error: String(err) }, { status: 500 })
  }
}
