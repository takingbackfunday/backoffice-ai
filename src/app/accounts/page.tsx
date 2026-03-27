import { redirect } from 'next/navigation'

export default function AccountsPage() {
  redirect('/bank-accounts?tab=accounts')
}
