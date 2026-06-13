import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  title?: string
  children?: React.ReactNode
}

export function Header({ title, children }: HeaderProps) {
  return (
    <header
      className="flex h-14 items-center justify-between border-b px-6"
      data-testid="page-header"
    >
      <div className="min-w-0">
        {children ?? (title ? <h1 className="text-base font-semibold">{title}</h1> : null)}
      </div>
      <UserButton />
    </header>
  )
}
