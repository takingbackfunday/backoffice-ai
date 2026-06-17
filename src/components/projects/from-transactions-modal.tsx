'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useFromTransactions, type TxForPicker } from './hooks/use-from-transactions'
import { uid, type LineItemInput } from './hooks/use-invoice-form'
import { sum, toDisplay } from '@/lib/money'

interface ProjectOption {
  id: string
  name: string
}

interface FromTransactionsModalProps {
  projectId: string
  projectName: string
  onClose: () => void
  onSelectProject?: (projectId: string) => void
}

export function FromTransactionsModal({ projectId, projectName, onClose, onSelectProject }: FromTransactionsModalProps) {
  const initialProjectIdRef = useRef(projectId)
  const [effectiveProjectId, setEffectiveProjectId] = useState(projectId)
  const [effectiveProjectName, setEffectiveProjectName] = useState(projectName)
  const [searchInput, setSearchInput] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects] = useState(!projectId)
  const [projectsError, setProjectsError] = useState<string | null>(null)

  const {
    tab,
    setTab,
    setSearch,
    transactions,
    selectedIds,
    loading,
    error,
    taggingIds,
    toggleSelection,
    selectAll,
    deselectAll,
    tagToProject,
    getSelectedTransactions,
  } = useFromTransactions({ projectId: effectiveProjectId })

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput) }, 300)
    return () => { clearTimeout(timer) }
  }, [searchInput, setSearch])

  useEffect(() => {
    if (projectId) return
    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    fetch('/api/projects?type=CLIENT', { signal: controller.signal })
      .then(async res => {
        clearTimeout(timeout)
        if (!res.ok) throw new Error('Failed to load projects')
        const json = (await res.json()) as { data: ProjectOption[] }
        if (!cancelled) setProjects(json.data ?? [])
      })
      .catch(e => {
        clearTimeout(timeout)
        if ((e as Error | undefined)?.name === 'AbortError') return
        if (!cancelled) setProjectsError(e instanceof Error ? e.message : 'Failed to load projects')
      })
      .finally(() => { if (!cancelled) setLoadingProjects(false) })
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout) }
  }, [projectId])

  const handleSelectProject = useCallback((id: string) => {
    setEffectiveProjectId(id)
    const name = projects.find(p => p.id === id)?.name
    if (name) setEffectiveProjectName(name)
  }, [projects])

  const handleAddToInvoice = useCallback(() => {
    const selected = getSelectedTransactions()
    if (selected.length === 0) return
    const items: LineItemInput[] = selected.map(tx => ({
      id: uid(),
      description: tx.description,
      quantity: '1',
      qtyUnit: 'flat fee',
      unitPrice: String(Math.abs(tx.amount)),
      isTaxLine: false,
    }))
    sessionStorage.setItem('invoice-from-transactions', JSON.stringify(items))
    const projectChanged = onSelectProject && effectiveProjectId !== initialProjectIdRef.current
    if (projectChanged && onSelectProject) {
      onSelectProject(effectiveProjectId)
      // Defer event dispatch so the new InvoiceEditor mounts first and its
      // on-mount sessionStorage check picks up the line items
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('invoice-from-transactions-trigger'))
      }, 0)
    } else {
      window.dispatchEvent(new CustomEvent('invoice-from-transactions-trigger'))
    }
    onClose()
  }, [getSelectedTransactions, effectiveProjectId, onSelectProject, onClose])

  const selectedCount = selectedIds.size
  const selectedTransactions = getSelectedTransactions()
  const selectedTotal = toDisplay(sum(selectedTransactions.map(t => Math.abs(t.amount))))
  const totalCurrency = selectedTransactions[0]?.account.currency ?? 'USD'
  const displayName = effectiveProjectName || projectName

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Add expenses from transactions</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </DialogTitle>
          <DialogDescription>
            Pick expense transactions to convert into invoice line items.
          </DialogDescription>
        </DialogHeader>

        {!projectId && (
          <div className="mb-2">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Which project is this invoice for? <span className="text-destructive">*</span>
            </label>
            <select
              value={effectiveProjectId}
              onChange={e => { handleSelectProject(e.target.value) }}
              disabled={loadingProjects}
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">{loadingProjects ? 'Loading…' : 'Select a project…'}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {projectsError && <p className="text-xs text-destructive mt-1">{projectsError}</p>}
          </div>
        )}

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search transactions…"
            className="w-full rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setTab('project')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              tab === 'project'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
            }`}
          >
            This project
          </button>
          <button
            onClick={() => setTab('all')}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              tab === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
            }`}
          >
            All transactions
          </button>
          {selectedCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {selectedCount} selected
            </span>
          )}
        </div>

        {error && <p className="text-xs text-destructive mb-2">{error}</p>}

        <div className="flex-1 overflow-y-auto max-h-[400px] border rounded-lg bg-muted/20">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Loading…</div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <p className="text-sm font-medium text-muted-foreground">No expenses found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {effectiveProjectId
                  ? 'Try switching tabs or clearing the search.'
                  : 'Select a project above to see transactions.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map(tx => (
                <TxRow
                  key={tx.id}
                  tx={tx}
                  projectId={effectiveProjectId}
                  projectName={displayName}
                  selected={selectedIds.has(tx.id)}
                  tagging={taggingIds.has(tx.id)}
                  showTagButton={tab === 'all'}
                  onToggle={() => toggleSelection(tx.id)}
                  onTag={() => tagToProject(tx.id)}
                />
              ))}
            </div>
          )}
        </div>

        {transactions.length > 0 && !loading && (
          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:underline"
            >
              Select all visible
            </button>
            <span className="text-xs text-muted-foreground">·</span>
            <button
              onClick={deselectAll}
              className="text-xs text-primary hover:underline"
            >
              Deselect all visible
            </button>
          </div>
        )}

        <DialogFooter className="mt-4 flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {selectedCount} selected ·{' '}
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: totalCurrency }).format(selectedTotal)} total
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddToInvoice}
              disabled={selectedCount === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Add to invoice
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TxRow({
  tx,
  projectId,
  projectName,
  selected,
  tagging,
  showTagButton,
  onToggle,
  onTag,
}: {
  tx: TxForPicker
  projectId: string
  projectName: string
  selected: boolean
  tagging: boolean
  showTagButton: boolean
  onToggle: () => void
  onTag: () => void
}) {
  const isTaggedToProject = tx.workspace?.id === projectId
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: tx.account.currency ?? 'USD' })

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 text-xs transition-colors hover:bg-muted/40 cursor-pointer ${selected ? 'bg-blue-50' : ''}`}
      onClick={() => onToggle()}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={e => e.stopPropagation()}
        onChange={onToggle}
        className="shrink-0"
      />
      <div className="w-20 shrink-0 text-muted-foreground whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium text-foreground">{tx.description}</div>
        {tx.payee?.name && <div className="truncate text-muted-foreground text-[11px]">{tx.payee.name}</div>}
      </div>
      <div className="w-24 shrink-0 text-right tabular-nums font-medium">{fmt.format(Math.abs(tx.amount))}</div>
      <div className="w-28 shrink-0 flex justify-end">
        {isTaggedToProject ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
            <Check className="w-3 h-3" />
            {projectName || tx.workspace?.name || 'Project'}
          </span>
        ) : tx.workspace ? (
          <span className="text-[10px] text-muted-foreground truncate max-w-[110px]" title={tx.workspace.name}>
            {tx.workspace.name}
          </span>
        ) : showTagButton ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onTag() }}
            disabled={tagging}
            className="text-[10px] px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {tagging ? '…' : 'Tag to project'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
