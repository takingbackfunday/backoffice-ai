'use client'

import Link from 'next/link'

interface Props {
  step?: 2 | 3
  message: string
  onSkip: () => void
  actionLabel?: string
  actionHref?: string
}

export function OnboardingBanner({ step, message, onSkip, actionLabel, actionHref }: Props) {
  const dots = step ? [1, 2, 3] : []

  return (
    <div className="bg-[#EEEDFE] border border-[#534AB7]/20 rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {step && (
            <div className="flex items-center gap-2 mb-1.5">
              {dots.map((d) => (
                <span key={d} className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      d <= step ? 'bg-[#534AB7]' : 'border border-[#534AB7]/40'
                    }`}
                  />
                  {d < 3 && <span className="w-4 h-px bg-[#534AB7]/30" />}
                </span>
              ))}
              <span className="text-xs font-medium text-[#534AB7] ml-1">Step {step} of 3</span>
            </div>
          )}
          <p className="text-sm text-[#2D2770]">{message}</p>
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-1 mt-2 rounded-md bg-[#534AB7] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3C3489] transition-colors"
            >
              {actionLabel}
            </Link>
          )}
        </div>
        <button
          onClick={onSkip}
          className="shrink-0 text-xs text-[#534AB7]/70 hover:text-[#534AB7] underline underline-offset-2 whitespace-nowrap"
        >
          Skip setup →
        </button>
      </div>
    </div>
  )
}
