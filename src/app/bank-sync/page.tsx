import { redirect } from 'next/navigation'

export default function BankSyncPage() {
  redirect('/bank-accounts?tab=manual-sync')
}
