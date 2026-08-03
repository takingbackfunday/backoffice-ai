export type ContentWidth = 'md' | 'lg'

export function contentWidthClass(width?: ContentWidth): string | undefined {
  if (width === 'md') return 'max-w-3xl'
  if (width === 'lg') return 'max-w-4xl'
  return undefined
}
