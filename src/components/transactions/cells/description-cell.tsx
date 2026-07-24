'use client'

import React from 'react'

/**
 * View-mode description cell: text wraps within a responsive max-width so
 * long bank descriptions stay fully visible (break-words handles long
 * unbroken strings).
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
      <span className="max-w-[clamp(180px,22vw,420px)] block whitespace-normal break-words">
        {value}
      </span>
    </td>
  )
}
