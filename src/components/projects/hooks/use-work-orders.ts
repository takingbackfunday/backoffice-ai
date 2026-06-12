'use client'

import { useState } from 'react'
import { toDisplay } from '@/lib/money'

interface Vendor { id: string; name: string; specialty: string | null }
interface Transaction { id: string; date: string; amount: string | number; description: string }
interface Bill {
  id: string; amount: string | number; status: string; issueDate: string
  billNumber: string | null; fileUrl: string | null; fileName: string | null; notes: string | null
  dueDate: string | null
  transaction: Transaction | null
}
interface WorkOrder {
  id: string; title: string; description: string | null; status: string
  agreedCost: string | number | null; scheduledDate: string | null
  vendor: Vendor | null
  bills: Bill[]
}
interface WorkOrderContext {
  type: 'job' | 'maintenance'
  jobId?: string
  maintenanceRequestId?: string
}

interface WoForm {
  title: string; description: string; vendorId: string; agreedCost: string; scheduledDate: string
}

interface BillForm {
  billNumber: string; amount: string; issueDate: string; dueDate: string; notes: string
}

export function useWorkOrders(initial: WorkOrder[], vendors: Vendor[], projectId: string, context: WorkOrderContext) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(initial)
  const [showWoForm, setShowWoForm] = useState(false)
  const [savingWo, setSavingWo] = useState(false)
  const [expandedWo, setExpandedWo] = useState<string | null>(null)
  const [showBillForm, setShowBillForm] = useState<string | null>(null)
  const [savingBill, setSavingBill] = useState(false)
  const [uploadingBill, setUploadingBill] = useState(false)
  const [billFile, setBillFile] = useState<File | null>(null)
  const [txnPickerBillId, setTxnPickerBillId] = useState<{ woId: string; billId: string } | null>(null)
  const [unlinkedTxns, setUnlinkedTxns] = useState<Transaction[]>([])
  const [loadingTxns, setLoadingTxns] = useState(false)

  const [vendorsList, setVendorsList] = useState<Vendor[]>(vendors)

  const [woFormCreatingVendor, setWoFormCreatingVendor] = useState(false)
  const [panelCreatingVendorForWoId, setPanelCreatingVendorForWoId] = useState<string | null>(null)
  const [newVendorName, setNewVendorName] = useState('')
  const [newVendorSpecialty, setNewVendorSpecialty] = useState('')
  const [savingVendor, setSavingVendor] = useState(false)

  const [woForm, setWoForm] = useState<WoForm>({
    title: '', description: '', vendorId: '', agreedCost: '', scheduledDate: '',
  })
  const [billForm, setBillForm] = useState<BillForm>({
    billNumber: '', amount: '', issueDate: '', dueDate: '', notes: '',
  })

  async function createWorkOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!woForm.title.trim()) return
    setSavingWo(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/work-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: woForm.title,
          description: woForm.description || undefined,
          vendorId: woForm.vendorId || undefined,
          agreedCost: woForm.agreedCost ? Number(woForm.agreedCost) : undefined,
          scheduledDate: woForm.scheduledDate || undefined,
          ...(context.type === 'job' ? { jobId: context.jobId } : { maintenanceRequestId: context.maintenanceRequestId }),
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setWorkOrders(prev => [json.data, ...prev])
        setWoForm({ title: '', description: '', vendorId: '', agreedCost: '', scheduledDate: '' })
        setShowWoForm(false)
      }
    } finally {
      setSavingWo(false)
    }
  }

  async function updateWoStatus(woId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo => wo.id === woId ? json.data : wo))
    }
  }

  async function updateWoVendor(woId: string, vendorId: string | null) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId: vendorId || null }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo => wo.id === woId ? json.data : wo))
    }
  }

  async function handleCreateVendor(target: 'form' | string) {
    if (!newVendorName.trim()) return
    setSavingVendor(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVendorName.trim(), specialty: newVendorSpecialty || undefined }),
      })
      if (res.ok) {
        const j = await res.json()
        setVendorsList(prev => [...prev, j.data])
        if (target === 'form') {
          setWoForm(p => ({ ...p, vendorId: j.data.id }))
          setWoFormCreatingVendor(false)
        } else {
          await updateWoVendor(target, j.data.id)
          setPanelCreatingVendorForWoId(null)
        }
        setNewVendorName('')
        setNewVendorSpecialty('')
      }
    } finally {
      setSavingVendor(false)
    }
  }

  async function deleteWorkOrder(woId: string) {
    if (!confirm('Delete this work order and all its bills?')) return
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}`, { method: 'DELETE' })
    if (res.ok) {
      setWorkOrders(prev => prev.filter(wo => wo.id !== woId))
    }
  }

  async function createBill(e: React.FormEvent, woId: string, startUpload: (files: File[]) => Promise<{ url: string }[] | undefined>) {
    e.preventDefault()
    const wo = workOrders.find(w => w.id === woId)
    if (!billForm.amount || !billForm.issueDate || !wo?.vendor) return
    setSavingBill(true)
    try {
      let fileUrl: string | undefined
      let fileName: string | undefined
      if (billFile) {
        setUploadingBill(true)
        const uploaded = await startUpload([billFile])
        setUploadingBill(false)
        if (uploaded?.[0]) {
          fileUrl = uploaded[0].url
          fileName = billFile.name
        }
      }
      const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: wo.vendor.id,
          billNumber: billForm.billNumber || undefined,
          amount: Number(billForm.amount),
          issueDate: billForm.issueDate,
          dueDate: billForm.dueDate || undefined,
          notes: billForm.notes || undefined,
          fileUrl,
          fileName,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        setWorkOrders(prev => prev.map(w =>
          w.id === woId ? { ...w, bills: [json.data, ...w.bills], status: 'BILLED' } : w
        ))
        setBillForm({ billNumber: '', amount: '', issueDate: '', dueDate: '', notes: '' })
        setBillFile(null)
        setShowBillForm(null)
      }
    } finally {
      setSavingBill(false)
      setUploadingBill(false)
    }
  }

  async function updateBillStatus(woId: string, billId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(status === 'PAID' ? { paidDate: new Date().toISOString() } : {}) }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId
          ? { ...wo, bills: wo.bills.map(b => b.id === billId ? json.data : b) }
          : wo
      ))
    }
  }

  async function openTxnPicker(woId: string, billId: string) {
    setTxnPickerBillId({ woId, billId })
    setLoadingTxns(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/unlinked-transactions`)
      if (res.ok) {
        const json = await res.json()
        setUnlinkedTxns(json.data ?? [])
      }
    } finally {
      setLoadingTxns(false)
    }
  }

  async function linkTransaction(woId: string, billId: string, transactionId: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    })
    if (res.ok) {
      const json = await res.json()
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId
          ? { ...wo, bills: wo.bills.map(b => b.id === billId ? json.data : b) }
          : wo
      ))
      setTxnPickerBillId(null)
    }
  }

  async function deleteBill(woId: string, billId: string) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${woId}/bills/${billId}`, { method: 'DELETE' })
    if (res.ok) {
      setWorkOrders(prev => prev.map(wo =>
        wo.id === woId ? { ...wo, bills: wo.bills.filter(b => b.id !== billId) } : wo
      ))
    }
  }

  const totalCosts = workOrders.flatMap(wo => wo.bills).reduce((s, b) => s + toDisplay(b.amount), 0)

  return {
    workOrders,
    showWoForm, setShowWoForm, savingWo,
    expandedWo, setExpandedWo,
    showBillForm, setShowBillForm, savingBill, uploadingBill,
    billFile, setBillFile, billForm, setBillForm,
    txnPickerBillId, setTxnPickerBillId, unlinkedTxns, loadingTxns,
    vendorsList,
    woFormCreatingVendor, setWoFormCreatingVendor,
    panelCreatingVendorForWoId, setPanelCreatingVendorForWoId,
    newVendorName, setNewVendorName,
    newVendorSpecialty, setNewVendorSpecialty,
    savingVendor,
    woForm, setWoForm,
    createWorkOrder, updateWoStatus, updateWoVendor, handleCreateVendor,
    deleteWorkOrder, createBill, updateBillStatus, openTxnPicker, linkTransaction, deleteBill,
    totalCosts,
  }
}
