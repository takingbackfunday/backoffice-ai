import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  return (
    <header
      className="flex h-14 items-center justify-between border-b px-6"
      data-testid="page-header"
    >
      <h1 className="text-base font-semibold">{title}</h1>
      <UserButton />
    </header>
  )
}
