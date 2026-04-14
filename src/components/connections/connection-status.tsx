'use client'

import { formatDistanceToNow } from 'date-fns'

interface ConnectionStatusProps {
  status: 'ACTIVE' | 'DISCONNECTED' | 'DEGRADED' | 'REVOKED'
  provider: 'PLAID' | 'ENABLE_BANKING' | 'BROWSER_AGENT'
  lastSyncAt: string | null
  disconnectReason: string | null
  connectionId: string
  onReauth?: () => void
  onSync?: () => void
  onDisconnect?: () => void
}

export function ConnectionStatus({
  status,
  provider,
  lastSyncAt,
  disconnectReason,
  onReauth,
  onSync,
  onDisconnect,
}: ConnectionStatusProps) {
  const providerLabel =
    provider === 'PLAID' ? 'Plaid' :
    provider === 'ENABLE_BANKING' ? 'Enable Banking' :
    'Browser Agent'

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    DISCONNECTED: 'bg-red-100 text-red-800',
    DEGRADED: 'bg-amber-100 text-amber-800',
    REVOKED: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toLowerCase()} via {providerLabel}
      </span>

      {lastSyncAt && (
        <span className="text-muted-foreground">
          Last synced {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}
        </span>
      )}

      {status === 'DISCONNECTED' && (
        <>
          {disconnectReason && (
            <span className="text-red-600 text-xs">{disconnectReason}</span>
          )}
          {onReauth && (
            <button onClick={onReauth} className="text-blue-600 underline text-xs">
              Re-authenticate
            </button>
          )}
        </>
      )}

      {status === 'ACTIVE' && onSync && (
        <button onClick={onSync} className="text-blue-600 underline text-xs">
          Sync now
        </button>
      )}

      {onDisconnect && (
        <button onClick={onDisconnect} className="text-red-600 underline text-xs">
          Disconnect
        </button>
      )}
    </div>
  )
}
