'use client'

interface Props {
  businessType: 'freelance' | 'property' | 'both'
  onDismiss: () => void
}

export function OverheadExplainerModal({ businessType, onDismiss }: Props) {
  const entityWord =
    businessType === 'freelance' ? 'client' :
    businessType === 'property' ? 'property' : 'client or property'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">📌</span>
          <h2 className="text-lg font-semibold">Business Overhead</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {`We've created a "Business Overhead" workspace for you. This is where you can tag expenses that aren't tied to a specific ${entityWord} — things like:`}
        </p>
        <ul className="text-sm text-muted-foreground mb-5 space-y-1.5 ml-4">
          <li className="flex items-center gap-2"><span>•</span> Software subscriptions</li>
          <li className="flex items-center gap-2"><span>•</span> Insurance premiums</li>
          <li className="flex items-center gap-2"><span>•</span> Office supplies</li>
          <li className="flex items-center gap-2"><span>•</span> Professional fees</li>
        </ul>
        <p className="text-xs text-muted-foreground mb-6">
          You can rename it anytime, but most users find it useful for tracking general operating costs.
        </p>
        <button
          onClick={onDismiss}
          className="w-full rounded-md bg-[#534AB7] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3C3489] transition-colors"
        >
          Got it →
        </button>
      </div>
    </div>
  )
}
