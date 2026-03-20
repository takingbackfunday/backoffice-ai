'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type BusinessType = 'freelance' | 'property' | 'both' | 'personal'

interface Option {
  type: BusinessType
  title: string
  description: string
  examples: string
  groups: number
  categories: number
}

const OPTIONS: Option[] = [
  {
    type: 'freelance',
    title: 'Freelance / sole proprietor',
    description: 'Schedule C — you sell services or products as a self-employed individual.',
    examples: 'Consultants, designers, contractors, creators, small business owners',
    groups: 0,
    categories: 0,
  },
  {
    type: 'property',
    title: 'Rental property / landlord',
    description: 'Schedule E — you earn income from residential or commercial rentals.',
    examples: 'Landlords, Airbnb hosts, small property managers',
    groups: 0,
    categories: 0,
  },
  {
    type: 'both',
    title: 'Both',
    description: 'Schedules C + E — you freelance and manage rental properties.',
    examples: 'A consultant who also rents out a unit or two',
    groups: 0,
    categories: 0,
  },
  {
    type: 'personal',
    title: 'Personal finance',
    description: 'Track personal income and spending — not for a business.',
    examples: 'Individuals tracking household budgets, personal savings goals',
    groups: 0,
    categories: 0,
  },
]

interface Props {
  counts: {
    freelance: { groups: number; categories: number }
    property: { groups: number; categories: number }
    both: { groups: number; categories: number }
    personal: { groups: number; categories: number }
  }
}

export function BusinessTypePicker({ counts }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<BusinessType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = OPTIONS.map((o) => ({
    ...o,
    groups: counts[o.type].groups,
    categories: counts[o.type].categories,
  }))

  async function handleConfirm() {
    if (!selected || saving) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/setup/business-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: selected }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
        return
      }
      router.push('/accounts?onboarding=1')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold mb-2">What kind of work do you do?</h2>
        <p className="text-sm text-muted-foreground">
          This sets up your expense categories to match the right IRS tax schedule.
          You can always add or remove categories later.
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-8">
        {options.map((opt) => (
          <button
            key={opt.type}
            onClick={() => setSelected(opt.type)}
            className={`text-left rounded-lg border-2 p-4 transition-all ${
              selected === opt.type
                ? 'border-[#534AB7] bg-[#EEEDFE]/40'
                : 'border-transparent bg-muted/40 hover:bg-muted'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">{opt.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                <p className="text-xs text-muted-foreground/70 mt-1 italic">{opt.examples}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{opt.groups} groups</p>
                <p className="text-xs text-muted-foreground">{opt.categories} subcategories</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4 text-center">{error}</p>}

      <div className="flex justify-center">
        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="rounded-md bg-[#534AB7] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#3C3489] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Setting up…' : 'Set up my categories'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-6">
        You can change this later in Settings, or manually add/remove category groups on this page.
      </p>
    </div>
  )
}
