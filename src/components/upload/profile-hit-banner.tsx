import type { ImportProfile } from '@/types'

export function ProfileHitBanner({
  profileHit,
  onRedetect,
}: {
  profileHit: ImportProfile
  onRedetect: () => void
}) {
  return (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-blue-800">
        Saved mapping (used {profileHit.useCount}×, last{' '}
        {new Date(profileHit.lastUsedAt).toLocaleDateString()})
      </p>
      <button
        type="button"
        onClick={onRedetect}
        className="text-xs text-blue-600 hover:underline"
      >
        Re-detect columns
      </button>
    </div>
  )
}
