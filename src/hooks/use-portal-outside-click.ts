'use client'

import { useOutsideClick } from './use-outside-click'

/**
 * useOutsideClick preset for triggers whose dropdown/popover is rendered
 * through PortalDropdown (portaled to document.body and stamped with
 * data-portal-dropdown). Without the ignore guard, any mousedown inside the
 * portaled panel counts as an "outside click" and closes it before the click
 * lands.
 */
export function usePortalOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  opts?: { enabled?: boolean },
) {
  return useOutsideClick(ref, onOutside, {
    ...opts,
    ignoreSelector: '[data-portal-dropdown]',
  })
}
