'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface PivotFilterDropdownProps {
  fieldKey: string
  fieldLabel: string
  uniqueValues: string[]
  activeValues: string[]
  onApply: (values: string[]) => void
  onClear: () => void
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

export function PivotFilterDropdown({
  fieldKey,
  fieldLabel,
  uniqueValues,
  activeValues,
  onApply,
  onClear,
  isOpen,
  onOpen,
  onClose,
}: PivotFilterDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const isFiltered = activeValues.length > 0

  // Initialize checked state when opening
  useEffect(() => {
    if (isOpen) {
      if (activeValues.length === 0) {
        setChecked(new Set(uniqueValues))
      } else {
        setChecked(new Set(activeValues))
      }
      // Position dropdown
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPosition({
          top: rect.bottom + window.scrollY + 4,
          left: Math.min(rect.left + window.scrollX, window.innerWidth - 260),
        })
      }
    }
  }, [isOpen, activeValues, uniqueValues])

  // Close on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
      triggerRef.current && !triggerRef.current.contains(e.target as Node)
    ) {
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      return () => document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen, handleOutsideClick])

  function handleApply() {
    if (checked.size === 0 || checked.size === uniqueValues.length) {
      onClear()
    } else {
      onApply(Array.from(checked))
    }
    onClose()
  }

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 9999, width: 240 }}
      className="bg-background border rounded-lg shadow-lg p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Filter: {fieldLabel}</span>
        {isFiltered && (
          <button onClick={() => { onClear(); onClose() }} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setChecked(new Set(uniqueValues))}
          className="text-xs text-blue-600 hover:underline"
        >
          Select All
        </button>
        <span className="text-muted-foreground">|</span>
        <button
          onClick={() => setChecked(new Set())}
          className="text-xs text-blue-600 hover:underline"
        >
          None
        </button>
      </div>
      <div className="overflow-y-auto max-h-[250px] space-y-1 mb-3">
        {uniqueValues.map(val => (
          <label key={val} className="flex items-center gap-2 cursor-pointer hover:bg-muted px-1 py-0.5 rounded text-sm">
            <input
              type="checkbox"
              className="w-4 h-4 accent-indigo-600"
              checked={checked.has(val)}
              onChange={e => {
                const next = new Set(checked)
                if (e.target.checked) next.add(val)
                else next.delete(val)
                setChecked(next)
              }}
            />
            <span className="truncate">{val || '(blank)'}</span>
          </label>
        ))}
      </div>
      <button
        onClick={handleApply}
        className="w-full py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
      >
        Apply
      </button>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        onClick={isOpen ? onClose : onOpen}
        className={`ml-1 text-xs leading-none px-0.5 rounded transition-colors ${isFiltered ? 'text-indigo-600' : 'text-muted-foreground hover:text-foreground'}`}
        aria-label={`Filter ${fieldLabel}`}
        title={`Filter ${fieldLabel}`}
        data-filter-key={fieldKey}
      >
        {isFiltered ? '▼' : '▽'}
      </button>
      {typeof window !== 'undefined' && dropdown ? createPortal(dropdown, document.body) : null}
    </>
  )
}
