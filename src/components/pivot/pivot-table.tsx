'use client'

import { useState, useRef, useLayoutEffect } from 'react'
import type { PivotResult, PivotConfig, AggregationType } from '@/lib/pivot/types'
import { FIELD_DEFINITIONS } from '@/lib/pivot/field-definitions'
import { formatValue } from '@/lib/pivot/engine'

interface PivotTableProps {
  result: PivotResult
  config: PivotConfig
}

function getLabel(key: string) {
  return FIELD_DEFINITIONS.find(f => f.key === key)?.label ?? key
}

function cellClass(value: number): string {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-red-600'
  return 'text-muted-foreground'
}

export function PivotTable({ result, config }: PivotTableProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const tableRef = useRef<HTMLTableElement>(null)
  const [stickyOffsets, setStickyOffsets] = useState<number[]>([])

  const { flatRows, groups, colKeys, colTotals, grandTotal } = result
  const { rows, cols, viewMode, showSubtotals, showGrandTotals, aggregation, filterValues } = config

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const headerRow = table.querySelector('thead tr')
    if (!headerRow) return
    const ths = Array.from(headerRow.querySelectorAll('th'))
    let acc = 0
    const offsets = ths.slice(0, rows.length).map(th => {
      const offset = acc
      acc += th.offsetWidth
      return offset
    })
    setStickyOffsets(offsets)
  }, [rows, flatRows, groups])

  if (flatRows.length === 0 && colKeys.filter(k => k !== '__total__').length === 0) {
    if (rows.length === 0 && cols.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-foreground mb-2">Build your pivot table</p>
          <p className="text-sm text-muted-foreground">Drag fields into Rows and Columns to get started, or pick a preset above.</p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-foreground mb-2">No data</p>
        <p className="text-sm text-muted-foreground">No transactions match the current filters.</p>
      </div>
    )
  }

  const displayColKeys = colKeys.filter(k => k !== '__total__')
  const hasColData = displayColKeys.length > 0

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function stickyStyle(index: number) {
    return { left: stickyOffsets[index] ?? index * 140 }
  }

  function renderHeaderCells() {
    return (
      <tr>
        {rows.map((rowField, i) => (
          <th
            key={rowField}
            className="sticky z-10 bg-background px-3 py-2 text-left text-sm font-semibold border-b border-r whitespace-nowrap"
            style={stickyStyle(i)}
          >
            {getLabel(rowField)}
          </th>
        ))}
        {hasColData ? (
          displayColKeys.map((ck) => (
            <th key={ck} className="px-3 py-2 text-right text-sm font-semibold border-b whitespace-nowrap">
              {ck}
            </th>
          ))
        ) : null}
        {showGrandTotals && (
          <th className="px-3 py-2 text-right text-sm font-semibold border-b border-l whitespace-nowrap">Row Total</th>
        )}
      </tr>
    )
  }

  function renderGrandTotalRow() {
    if (!showGrandTotals) return null
    return (
      <tr className="bg-muted font-bold border-t-2">
        <td
          colSpan={rows.length}
          className="sticky left-0 z-10 bg-background [box-shadow:inset_0_0_0_9999px_hsl(var(--muted))] px-3 py-2 text-sm"
        >
          Grand Total
        </td>
        {hasColData && displayColKeys.map(ck => (
          <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm ${cellClass(colTotals[ck] ?? 0)}`}>
            {formatValue(colTotals[ck] ?? 0, aggregation as AggregationType, config.truncateNumbers)}
          </td>
        ))}
        <td className={`px-3 py-2 text-right tabular-nums text-sm border-l ${cellClass(grandTotal)}`}>
          {formatValue(grandTotal, aggregation as AggregationType, config.truncateNumbers)}
        </td>
      </tr>
    )
  }

  // Tabular mode
  if (viewMode === 'tabular' || rows.length <= 1) {
    return (
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm border-collapse">
          <thead className="bg-muted/50">{renderHeaderCells()}</thead>
          <tbody>
            {flatRows.map((fr, idx) => {
              const isEven = idx % 2 === 0
              return (
              <tr
                key={idx}
                className={`hover:bg-blue-50 transition-colors ${isEven ? '' : 'bg-muted/20'}`}
              >
                {fr.rowValues.map((val, vi) => (
                  <td
                    key={vi}
                    className={`sticky z-10 bg-background px-3 py-2 text-sm border-b border-r whitespace-nowrap ${!isEven ? '[box-shadow:inset_0_0_0_9999px_hsl(var(--muted)/0.2)]' : ''}`}
                    style={stickyStyle(vi)}
                  >
                    {val}
                  </td>
                ))}
                {hasColData && displayColKeys.map(ck => (
                  <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm border-b ${cellClass(fr.cells[ck] ?? 0)}`}>
                    {fr.cells[ck] !== undefined ? formatValue(fr.cells[ck], aggregation as AggregationType, config.truncateNumbers) : '—'}
                  </td>
                ))}
                {showGrandTotals && (
                  <td className={`px-3 py-2 text-right tabular-nums text-sm border-b border-l ${cellClass(fr.rowTotal)}`}>
                    {formatValue(fr.rowTotal, aggregation as AggregationType, config.truncateNumbers)}
                  </td>
                )}
              </tr>
            )})}
          </tbody>
          <tfoot>{renderGrandTotalRow()}</tfoot>
        </table>
      </div>
    )
  }

  // Outline mode (rows.length >= 2)
  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="w-full text-sm border-collapse">
        <thead className="bg-muted/50">{renderHeaderCells()}</thead>
        <tbody>
          {groups.map(group => {
            const isCollapsed = collapsedGroups.has(group.key)
            return (
              <>
                {/* Group header row — inline with first child */}
                {(() => {
                  const firstChild = group.children[0]
                  return (
                    <tr key={`grp-${group.key}`} className={`bg-muted font-semibold hover:bg-blue-50 transition-colors`}>
                      <td
                        className="sticky z-10 bg-background [box-shadow:inset_0_0_0_9999px_hsl(var(--muted))] px-3 py-2 text-sm border-b border-r whitespace-nowrap"
                        style={stickyStyle(0)}
                      >
                        <button
                          onClick={() => toggleGroup(group.key)}
                          className="mr-1.5 text-muted-foreground hover:text-foreground"
                          aria-label={isCollapsed ? `Expand ${group.key}` : `Collapse ${group.key}`}
                        >
                          {isCollapsed ? '▸' : '▾'}
                        </button>
                        {group.key}
                      </td>
                      {/* Second row column — empty when collapsed (subtotals fill data cells), first child value when expanded */}
                      {!isCollapsed && firstChild && firstChild.rowValues.slice(1).map((val, vi) => (
                        <td
                          key={vi}
                          className="sticky z-10 bg-background [box-shadow:inset_0_0_0_9999px_hsl(var(--muted))] px-3 py-2 text-sm border-b border-r pl-6 whitespace-nowrap"
                          style={stickyStyle(vi + 1)}
                        >
                          {val}
                        </td>
                      ))}
                      {isCollapsed && rows.slice(1).map((_, vi) => (
                        <td key={vi} className="sticky z-10 bg-background [box-shadow:inset_0_0_0_9999px_hsl(var(--muted))] px-3 py-2 text-sm border-b border-r" style={stickyStyle(vi + 1)} />
                      ))}
                      {/* Data cells — subtotals when collapsed, first child when expanded */}
                      {hasColData && isCollapsed && displayColKeys.map(ck => (
                        <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm border-b ${cellClass(group.subtotals[ck] ?? 0)}`}>
                          {formatValue(group.subtotals[ck] ?? 0, aggregation as AggregationType, config.truncateNumbers)}
                        </td>
                      ))}
                      {hasColData && !isCollapsed && firstChild && displayColKeys.map(ck => (
                        <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm border-b ${cellClass(firstChild.cells[ck] ?? 0)}`}>
                          {firstChild.cells[ck] !== undefined ? formatValue(firstChild.cells[ck], aggregation as AggregationType, config.truncateNumbers) : '—'}
                        </td>
                      ))}
                      {hasColData && !isCollapsed && !firstChild && displayColKeys.map(ck => (
                        <td key={ck} className="px-3 py-2 border-b" />
                      ))}
                      {showGrandTotals && isCollapsed && (
                        <td className={`px-3 py-2 text-right tabular-nums text-sm border-b border-l ${cellClass(group.rowTotal)}`}>
                          {formatValue(group.rowTotal, aggregation as AggregationType, config.truncateNumbers)}
                        </td>
                      )}
                      {showGrandTotals && !isCollapsed && firstChild && (
                        <td className={`px-3 py-2 text-right tabular-nums text-sm border-b border-l ${cellClass(firstChild.rowTotal)}`}>
                          {formatValue(firstChild.rowTotal, aggregation as AggregationType, config.truncateNumbers)}
                        </td>
                      )}
                      {showGrandTotals && !isCollapsed && !firstChild && <td className="px-3 py-2 border-b border-l" />}
                    </tr>
                  )
                })()}

                {/* Children (skip first — already rendered in group header row) */}
                {!isCollapsed && group.children.slice(1).map((child, ci) => {
                  const isEven = ci % 2 === 0
                  const stripeClass = !isEven ? '[box-shadow:inset_0_0_0_9999px_hsl(var(--muted)/0.2)]' : ''
                  return (
                  <tr
                    key={`child-${group.key}-${ci}`}
                    className={`hover:bg-blue-50 transition-colors ${isEven ? '' : 'bg-muted/20'}`}
                  >
                    {/* First col empty (parent shown in group header) */}
                    <td className={`sticky z-10 bg-background px-3 py-2 text-sm border-b border-r ${stripeClass}`} style={stickyStyle(0)} />
                    {child.rowValues.slice(1).map((val, vi) => (
                      <td
                        key={vi}
                        className={`sticky z-10 bg-background px-3 py-2 text-sm border-b border-r pl-6 whitespace-nowrap ${stripeClass}`}
                        style={stickyStyle(vi + 1)}
                      >
                        {val}
                      </td>
                    ))}
                    {hasColData && displayColKeys.map(ck => (
                      <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm border-b ${cellClass(child.cells[ck] ?? 0)}`}>
                        {child.cells[ck] !== undefined ? formatValue(child.cells[ck], aggregation as AggregationType, config.truncateNumbers) : '—'}
                      </td>
                    ))}
                    {showGrandTotals && (
                      <td className={`px-3 py-2 text-right tabular-nums text-sm border-b border-l ${cellClass(child.rowTotal)}`}>
                        {formatValue(child.rowTotal, aggregation as AggregationType, config.truncateNumbers)}
                      </td>
                    )}
                  </tr>
                )})}

                {/* Subtotal row */}
                {!isCollapsed && showSubtotals && (
                  <tr key={`sub-${group.key}`} className="bg-muted/50 font-medium">
                    <td
                      colSpan={rows.length}
                      className="sticky left-0 z-10 bg-background [box-shadow:inset_0_0_0_9999px_hsl(var(--muted)/0.5)] px-3 py-2 text-sm pl-6"
                    >
                      {group.key} Total
                    </td>
                    {hasColData && displayColKeys.map(ck => (
                      <td key={ck} className={`px-3 py-2 text-right tabular-nums text-sm ${cellClass(group.subtotals[ck] ?? 0)}`}>
                        {formatValue(group.subtotals[ck] ?? 0, aggregation as AggregationType, config.truncateNumbers)}
                      </td>
                    ))}
                    {showGrandTotals && (
                      <td className={`px-3 py-2 text-right tabular-nums text-sm border-l ${cellClass(group.rowTotal)}`}>
                        {formatValue(group.rowTotal, aggregation as AggregationType, config.truncateNumbers)}
                      </td>
                    )}
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
        <tfoot>{renderGrandTotalRow()}</tfoot>
      </table>
    </div>
  )
}
