'use client'

import React from 'react'

/**
 * View-mode description cell: responsive max-width and the full bank
 * description as a native tooltip (the row-level "Click to edit" title is
 * deliberately not set here so it doesn't suppress this one).
 */
export function DescriptionCell({
  value,
  className,
  onStartEdit,
}: {
  value: string
  className: string
  onStartEdit: () => void
}) {
  return (
    <td className={className} onClick={onStartEdit} data-testid="cell-description">
      <span className="max-w-[clamp(180px,22vw,420px)] truncate block" title={value}>
        {value}
      </span>
    </td>
  )
}
