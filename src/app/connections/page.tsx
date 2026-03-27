import { redirect } from 'next/navigation'

export default function ConnectionsPage() {
  redirect('/bank-accounts?tab=auto-sync')
}
