'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ProjectTypePicker } from './project-type-picker'
import { ClientProfileForm } from './client-profile-form'
import { PropertyProfileForm } from './property-profile-form'
import { cn } from '@/lib/utils'

type ProjectType = 'CLIENT' | 'PROPERTY' | 'OTHER'
type Step = 1 | 2 | 3

export function ProjectCreationWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawType = searchParams.get('type')
  const validInitialType: ProjectType | null = rawType && ['CLIENT', 'PROPERTY', 'OTHER'].includes(rawType)
    ? (rawType as ProjectType)
    : null
  const [step, setStep] = useState<Step>(validInitialType ? 2 : 1)
  const [type, setType] = useState<ProjectType | null>(validInitialType)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Common fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Client fields
  const [clientData, setClientData] = useState({
    contactName: '', email: '', phone: '', company: '', address: '',
    billingType: 'HOURLY', defaultRate: '', currency: 'USD', paymentTermDays: '30',
  })

  // Property fields
  const [propertyData, setPropertyData] = useState({
    address: '', city: '', state: '', zipCode: '', country: 'US',
    propertyType: 'RESIDENTIAL', yearBuilt: '', squareFootage: '', lotSize: '',
    purchasePrice: '', purchaseDate: '', currentValue: '', mortgageBalance: '',
    units: [] as Array<{
      unitLabel: string; bedrooms: string; bathrooms: string;
      squareFootage: string; monthlyRent: string
    }>,
  })

  function handleTypeSelect(t: ProjectType) {
    setType(t)
    setStep(2)
  }

  function handleNext() {
    setError(null)
    if (!name.trim()) {
      setError('Project name is required')
      return
    }
    if (type === 'PROPERTY' && !propertyData.address.trim()) {
      setError('Property address is required')
      return
    }
    setStep(3)
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    try {
      const body: Record<string, unknown> = { name, type, description, isActive: true }

      if (type === 'CLIENT') {
        body.client = {
          contactName: clientData.contactName || undefined,
          email: clientData.email || undefined,
          phone: clientData.phone || undefined,
          company: clientData.company || undefined,
          address: clientData.address || undefined,
          billingType: clientData.billingType,
          defaultRate: clientData.defaultRate ? parseFloat(clientData.defaultRate) : undefined,
          currency: clientData.currency,
          paymentTermDays: clientData.paymentTermDays ? parseInt(clientData.paymentTermDays) : 30,
        }
      }

      if (type === 'PROPERTY') {
        body.property = {
          address: propertyData.address,
          city: propertyData.city || undefined,
          state: propertyData.state || undefined,
          zipCode: propertyData.zipCode || undefined,
          country: propertyData.country,
          propertyType: propertyData.propertyType,
          yearBuilt: propertyData.yearBuilt ? parseInt(propertyData.yearBuilt) : undefined,
          squareFootage: propertyData.squareFootage ? parseInt(propertyData.squareFootage) : undefined,
          lotSize: propertyData.lotSize || undefined,
          purchasePrice: propertyData.purchasePrice ? parseFloat(propertyData.purchasePrice) : undefined,
          purchaseDate: propertyData.purchaseDate || undefined,
          currentValue: propertyData.currentValue ? parseFloat(propertyData.currentValue) : undefined,
          mortgageBalance: propertyData.mortgageBalance ? parseFloat(propertyData.mortgageBalance) : undefined,
        }
        body.units = propertyData.units
          .filter(u => u.unitLabel.trim())
          .map(u => ({
            unitLabel: u.unitLabel,
            bedrooms: u.bedrooms ? parseInt(u.bedrooms) : undefined,
            bathrooms: u.bathrooms ? parseFloat(u.bathrooms) : undefined,
            squareFootage: u.squareFootage ? parseInt(u.squareFootage) : undefined,
            monthlyRent: u.monthlyRent ? parseFloat(u.monthlyRent) : undefined,
          }))
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to create project')
        return
      }

      router.push(`/projects/${json.data.slug}`)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const typeLabels: Record<ProjectType, string> = {
    CLIENT: 'Client',
    PROPERTY: 'Property',
    OTHER: 'Other',
  }

  return (
    <div className="max-w-4xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {s}
            </div>
            {s < 3 && <div className={cn('h-px w-12', step > s ? 'bg-primary' : 'bg-border')} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">
          {step === 1 && 'Choose type'}
          {step === 2 && 'Project details'}
          {step === 3 && 'Confirm'}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Type picker */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">What kind of project is this?</h2>
          <ProjectTypePicker onSelect={handleTypeSelect} />
        </div>
      )}

      {/* Step 2: Details form */}
      {step === 2 && type && (
        <div>
          <h2 className="text-lg font-semibold mb-4">
            {typeLabels[type]} details
          </h2>

          <div className="space-y-6">
            {/* Project name (always shown) */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Project name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={
                  type === 'CLIENT' ? 'Acme Corp' :
                  type === 'PROPERTY' ? '123 Main St Rental' :
                  'My Project'
                }
                autoFocus
              />
            </div>

            {/* Type-specific forms */}
            {type === 'CLIENT' && (
              <ClientProfileForm data={clientData} onChange={setClientData} />
            )}

            {type === 'PROPERTY' && (
              <PropertyProfileForm data={propertyData} onChange={setPropertyData} />
            )}

            {type === 'OTHER' && (
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-8">
            <button
              type="button"
              onClick={() => { setStep(1); setError(null) }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && type && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Review & create</h2>

          <div className="rounded-lg border p-4 space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{name}</span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{typeLabels[type]}</span>
            </div>
            {type === 'CLIENT' && clientData.company && (
              <p className="text-sm text-muted-foreground">{clientData.company}</p>
            )}
            {type === 'PROPERTY' && (
              <p className="text-sm text-muted-foreground">{propertyData.address}</p>
            )}
            {type === 'PROPERTY' && propertyData.units.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {propertyData.units.filter(u => u.unitLabel).length} unit(s)
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setStep(2); setError(null) }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
