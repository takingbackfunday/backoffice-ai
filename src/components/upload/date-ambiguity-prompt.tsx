import { renderDateExample } from '@/lib/date-format'

export function DateAmbiguityPrompt({
  ambiguity,
  onChoose,
}: {
  ambiguity: { chosen: string; alternatives: string[]; exampleRaw: string }
  onChoose: (fmt: string) => void
}) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1.5" data-testid="date-ambiguity-prompt">
      <p className="text-xs text-amber-900">
        Dates like <strong>{ambiguity.exampleRaw}</strong> can be read two ways. We&apos;re using{' '}
        <strong>{renderDateExample(ambiguity.exampleRaw, ambiguity.chosen)}</strong> — tap to change:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {[ambiguity.chosen, ...ambiguity.alternatives].map((fmt) => (
          <button
            key={fmt}
            type="button"
            onClick={() => onChoose(fmt)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              fmt === ambiguity.chosen
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-amber-300 bg-white text-amber-900 hover:border-amber-500'
            }`}
            data-testid={`date-format-choice-${fmt}`}
          >
            {renderDateExample(ambiguity.exampleRaw, fmt)}
          </button>
        ))}
      </div>
    </div>
  )
}
