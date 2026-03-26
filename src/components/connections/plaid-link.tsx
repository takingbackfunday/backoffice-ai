'use client'

import { useCallback } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'

interface PlaidLinkButtonProps {
  linkToken: string
  onSuccess: (publicToken: string, metadata: { institution?: { institution_id: string; name: string }; accounts: { id: string; name: string }[] }) => void
  onExit?: () => void
}

export function PlaidLinkButton({ linkToken, onSuccess, onExit }: PlaidLinkButtonProps) {
  const handleSuccess = useCallback<PlaidLinkOnSuccess>((publicToken, metadata) => {
    onSuccess(publicToken, {
      institution: metadata.institution
        ? { institution_id: metadata.institution.institution_id, name: metadata.institution.name }
        : undefined,
      accounts: metadata.accounts.map(a => ({ id: a.id, name: a.name })),
    })
  }, [onSuccess])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: () => onExit?.(),
  })

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
    >
      Connect with Plaid
    </button>
  )
}
