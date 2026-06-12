'use client'

import { useState } from 'react'

export function useBulkSelect(opts: {
  localRows: { id: string }[]
  setLocalRows: React.Dispatch<React.SetStateAction<{ id: string }[]>>
  setTotal: React.Dispatch<React.SetStateAction<number>>
}) {
  const { localRows, setLocalRows, setTotal } = opts

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeletedCount, setBulkDeletedCount] = useState(0)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const allChecked = localRows.length > 0 && localRows.every((r) => selectedIds.has(r.id))
  const someChecked = selectedIds.size > 0

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(localRows.map((r) => r.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) { setSelectMode(false); return }
    setSelectMode(false)
    setBulkDeleting(true)
    setBulkDeletedCount(0)
    const ids = Array.from(selectedIds)
    ids.forEach((id) => setDeletingIds((s) => new Set(s).add(id)))

    let deleted = 0
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/transactions/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('failed')
          setLocalRows((rows) => rows.filter((r) => r.id !== id))
          setDeletingIds((s) => { const n = new Set(s); n.delete(id); return n })
          deleted++
          setBulkDeletedCount(deleted)
        })
      )
    )

    setSelectedIds(new Set())
    setTotal((t) => t - deleted)
    setBulkDeleting(false)
    setBulkDeletedCount(0)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  return {
    selectedIds, setSelectedIds,
    selectMode, setSelectMode,
    bulkDeleting, setBulkDeleting,
    bulkDeletedCount, setBulkDeletedCount,
    deletingIds, setDeletingIds,
    allChecked, someChecked,
    toggleAll, toggleRow,
    confirmBulkDelete, exitSelectMode,
  }
}
