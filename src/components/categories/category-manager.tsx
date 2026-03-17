'use client'

import { useEffect, useRef, useState } from 'react'

interface Category {
  id: string
  name: string
  groupId: string
  sortOrder: number
  _count: { transactions: number }
}

interface CategoryGroupWithCounts {
  id: string
  name: string
  sortOrder: number
  categories: Category[]
}

export function CategoryManager({ initialGroups }: { initialGroups?: CategoryGroupWithCounts[] } = {}) {
  const [groups, setGroups] = useState<CategoryGroupWithCounts[]>(initialGroups ?? [])
  const [loading, setLoading] = useState(!initialGroups)
  const [error, setError] = useState<string | null>(null)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Add group
  const [newGroupName, setNewGroupName] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)

  // Add category
  const [addingCatGroupId, setAddingCatGroupId] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameType, setRenameType] = useState<'group' | 'category' | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (initialGroups) return
    fetch('/api/category-groups')
      .then((r) => r.json())
      .then((j) => { if (!j.error) setGroups(j.data ?? []) })
      .catch(() => setError('Failed to load categories'))
      .finally(() => setLoading(false))
  }, [initialGroups])

  useEffect(() => {
    if (renamingId) renameRef.current?.focus()
  }, [renamingId])

  function toggleCollapse(id: string) {
    setCollapsed((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  async function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    setAddingGroup(true)
    try {
      const res = await fetch('/api/category-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setError(j.error ?? 'Failed to add group'); return }
      setGroups((prev) => [...prev, { ...j.data, categories: [] }])
      setNewGroupName('')
    } finally {
      setAddingGroup(false)
    }
  }

  async function addCategory(groupId: string) {
    const name = newCatName.trim()
    if (!name) return
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, groupId }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setError(j.error ?? 'Failed to add category'); return }
      setGroups((prev) => prev.map((g) =>
        g.id === groupId
          ? { ...g, categories: [...g.categories, { ...j.data, _count: { transactions: 0 } }] }
          : g
      ))
      setNewCatName('')
      setAddingCatGroupId(null)
    } catch {
      setError('Failed to add category')
    }
  }

  async function renameGroup(id: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }
    const res = await fetch(`/api/category-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const j = await res.json()
    if (res.ok && !j.error) {
      setGroups((prev) => prev.map((g) => g.id === id ? { ...g, name } : g))
    }
    setRenamingId(null)
  }

  async function renameCategory(id: string) {
    const name = renameValue.trim()
    if (!name) { setRenamingId(null); return }
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const j = await res.json()
    if (res.ok && !j.error) {
      setGroups((prev) => prev.map((g) => ({
        ...g,
        categories: g.categories.map((c) => c.id === id ? { ...c, name } : c),
      })))
    }
    setRenamingId(null)
  }

  async function deleteGroup(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/category-groups/${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!res.ok || j.error) { setError(j.error ?? 'Failed to delete group'); setDeletingId(null); return }
    setGroups((prev) => prev.filter((g) => g.id !== id))
    setDeletingId(null)
  }

  async function deleteCategory(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!res.ok || j.error) { setError(j.error ?? 'Failed to delete category'); setDeletingId(null); return }
    setGroups((prev) => prev.map((g) => ({ ...g, categories: g.categories.filter((c) => c.id !== id) })))
    setDeletingId(null)
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4" data-testid="category-manager">
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {groups.map((group) => (
        <div key={group.id} className="rounded-lg border overflow-hidden">
          {/* Group header */}
          <div className="flex items-center gap-2 bg-muted/60 px-3 py-1.5">
            <button
              onClick={() => toggleCollapse(group.id)}
              className="text-muted-foreground hover:text-foreground text-xs"
              aria-label={collapsed.has(group.id) ? 'Expand group' : 'Collapse group'}
            >
              {collapsed.has(group.id) ? '▶' : '▼'}
            </button>

            {renamingId === group.id && renameType === 'group' ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameGroup(group.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onBlur={() => renameGroup(group.id)}
                className="flex-1 rounded border border-blue-400 px-2 py-0.5 text-xs font-semibold outline-none"
                aria-label="Rename group"
              />
            ) : (
              <span
                className="flex-1 text-xs font-semibold cursor-pointer hover:text-primary"
                onClick={() => { setRenamingId(group.id); setRenameType('group'); setRenameValue(group.name) }}
                title="Click to rename"
              >
                {group.name}
              </span>
            )}

            <span className="text-xs text-muted-foreground">{group.categories.length} categories</span>

            <button
              onClick={() => deleteGroup(group.id)}
              disabled={deletingId === group.id || group.categories.some((c) => c._count.transactions > 0)}
              className="rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-30"
              title={group.categories.some((c) => c._count.transactions > 0)
                ? 'Cannot delete: categories have transactions'
                : 'Delete group'}
              aria-label="Delete group"
            >
              🗑
            </button>
          </div>

          {/* Categories */}
          {!collapsed.has(group.id) && (
            <ul className="divide-y">
              {group.categories.map((cat) => (
                <li key={cat.id} className="flex items-center gap-2 px-6 py-1 hover:bg-muted/20">
                  {renamingId === cat.id && renameType === 'category' ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameCategory(cat.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => renameCategory(cat.id)}
                      className="flex-1 rounded border border-blue-400 px-2 py-0.5 text-xs outline-none"
                      aria-label="Rename category"
                    />
                  ) : (
                    <span
                      className="flex-1 text-xs cursor-pointer hover:text-primary"
                      onClick={() => { setRenamingId(cat.id); setRenameType('category'); setRenameValue(cat.name) }}
                      title="Click to rename"
                    >
                      {cat.name}
                    </span>
                  )}

                  <span className="text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                    {cat._count.transactions}
                  </span>

                  <button
                    onClick={() => deleteCategory(cat.id)}
                    disabled={deletingId === cat.id || cat._count.transactions > 0}
                    className="rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-30"
                    title={cat._count.transactions > 0 ? 'Cannot delete: has transactions' : 'Delete category'}
                    aria-label="Delete category"
                  >
                    🗑
                  </button>
                </li>
              ))}

              {/* Add category inline */}
              {addingCatGroupId === group.id ? (
                <li className="flex items-center gap-2 px-6 py-1">
                  <input
                    autoFocus
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCategory(group.id)
                      if (e.key === 'Escape') { setAddingCatGroupId(null); setNewCatName('') }
                    }}
                    placeholder="Category name…"
                    className="flex-1 rounded border px-2 py-0.5 text-xs"
                    aria-label="New category name"
                  />
                  <button
                    onClick={() => addCategory(group.id)}
                    className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingCatGroupId(null); setNewCatName('') }}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    Cancel
                  </button>
                </li>
              ) : (
                <li className="px-6 py-1">
                  <button
                    onClick={() => { setAddingCatGroupId(group.id); setNewCatName('') }}
                    className="text-xs text-primary hover:underline"
                  >
                    + Add category
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      ))}

      {/* Add group */}
      <div className="flex items-center gap-2 pt-2">
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addGroup() }}
          placeholder="New group name…"
          className="rounded-md border px-3 py-1.5 text-xs w-56"
          aria-label="New group name"
        />
        <button
          onClick={addGroup}
          disabled={addingGroup || !newGroupName.trim()}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {addingGroup ? 'Adding…' : 'Add group'}
        </button>
      </div>
    </div>
  )
}
