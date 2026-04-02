'use client'

import { useState } from 'react'
import { useUploadThing } from '@/lib/uploadthing-client'
import { docTypeLabel } from '@/lib/doc-types'

interface SerializedListing {
  id: string
  title: string
  monthlyRent: number
  applicationFee: number | null
  screeningFee: number | null
  publicSlug: string
  requiredDocs: string[]
  unit: {
    unitLabel: string
    propertyProfile: {
      project: { name: string }
    }
  }
}

interface Props {
  listing: SerializedListing
}

type FormData = {
  // Step 1
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  // Step 2
  currentEmployer: string
  position: string
  annualIncome: string
  employmentDuration: string
  // Step 3
  previousLandlordName: string
  previousLandlordPhone: string
  previousAddress: string
  durationAtAddress: string
  reasonForLeaving: string
  // Step 4
  numberOfOccupants: string
  petType: string
  petBreed: string
  petWeight: string
  vehicles: string
  desiredMoveIn: string
  desiredLeaseTerm: string
  // Step 5 (consent)
  screeningConsent: boolean
  truthfulnessAttestation: boolean
  feeAcknowledgment: boolean
}

interface UploadedDoc {
  url: string
  name: string
  size: number
}

const BASE_STEPS = [
  'Personal info',
  'Employment',
  'Rental history',
  'Additional details',
]
const DOCS_STEP = 'Documents'
const CONSENT_STEP = 'Review & consent'

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function ApplicationFormClient({ listing }: Props) {
  const hasRequiredDocs = listing.requiredDocs.length > 0
  const STEPS = hasRequiredDocs
    ? [...BASE_STEPS, DOCS_STEP, CONSENT_STEP]
    : [...BASE_STEPS, CONSENT_STEP]

  const docsStepIndex = hasRequiredDocs ? 4 : -1
  const consentStepIndex = hasRequiredDocs ? 5 : 4

  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    fullName: '', email: '', phone: '', dateOfBirth: '',
    currentEmployer: '', position: '', annualIncome: '', employmentDuration: '',
    previousLandlordName: '', previousLandlordPhone: '', previousAddress: '', durationAtAddress: '', reasonForLeaving: '',
    numberOfOccupants: '', petType: '', petBreed: '', petWeight: '', vehicles: '', desiredMoveIn: '', desiredLeaseTerm: '',
    screeningConsent: false, truthfulnessAttestation: false, feeAcknowledgment: false,
  })

  // Documents state: map of docType -> uploaded file info
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({})
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [docErrors, setDocErrors] = useState<Record<string, string>>({})

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { startUpload } = useUploadThing('applicantDocUploader')

  function set(field: keyof FormData, value: string | boolean) {
    setFormData(f => ({ ...f, [field]: value }))
  }

  async function handleDocFile(docType: string, file: File) {
    if (file.type !== 'application/pdf') {
      setDocErrors(e => ({ ...e, [docType]: 'Only PDF files are accepted' }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocErrors(e => ({ ...e, [docType]: 'File must be under 10MB' }))
      return
    }
    setDocErrors(e => ({ ...e, [docType]: '' }))
    setUploadingDoc(docType)
    try {
      const res = await startUpload([file])
      if (!res?.[0]) {
        setDocErrors(e => ({ ...e, [docType]: 'Upload failed — please try again' }))
        return
      }
      const { url } = res[0] as { url: string }
      setUploadedDocs(d => ({ ...d, [docType]: { url, name: file.name, size: file.size } }))
    } catch {
      setDocErrors(e => ({ ...e, [docType]: 'Upload failed — please try again' }))
    } finally {
      setUploadingDoc(null)
    }
  }

  async function handleSubmit() {
    const hasFees = listing.applicationFee || listing.screeningFee
    if (!formData.screeningConsent || !formData.truthfulnessAttestation || (hasFees && !formData.feeAcknowledgment)) {
      setError('You must agree to all required checkboxes to proceed.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const applicationData = {
        personal: {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth,
        },
        employment: {
          currentEmployer: formData.currentEmployer,
          position: formData.position,
          annualIncome: formData.annualIncome,
          employmentDuration: formData.employmentDuration,
        },
        rentalHistory: {
          previousLandlordName: formData.previousLandlordName,
          previousLandlordPhone: formData.previousLandlordPhone,
          previousAddress: formData.previousAddress,
          durationAtAddress: formData.durationAtAddress,
          reasonForLeaving: formData.reasonForLeaving,
        },
        additional: {
          numberOfOccupants: formData.numberOfOccupants,
          pets: formData.petType ? { type: formData.petType, breed: formData.petBreed, weight: formData.petWeight } : null,
          vehicles: formData.vehicles,
          desiredLeaseTerm: formData.desiredLeaseTerm,
        },
      }

      // Build uploaded docs array for submission
      const uploadedDocsPayload = Object.entries(uploadedDocs).map(([fileType, doc]) => ({
        fileType,
        fileUrl: doc.url,
        fileName: doc.name,
        fileSize: doc.size,
      }))

      const res = await fetch('/api/public/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingSlug: listing.publicSlug,
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone || undefined,
          desiredMoveIn: formData.desiredMoveIn || undefined,
          screeningConsent: formData.screeningConsent,
          applicationData,
          uploadedDocs: uploadedDocsPayload,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30'

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Application submitted!</h1>
        <p className="text-sm text-muted-foreground">
          We received your application for <strong>{listing.unit.unitLabel}</strong> at{' '}
          <strong>{listing.unit.propertyProfile.project.name}</strong>. You will hear from the property manager soon.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">{listing.unit.propertyProfile.project.name} · {listing.unit.unitLabel}</p>
        <h1 className="text-xl font-bold mt-0.5">Rental Application</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {fmtCurrency(listing.monthlyRent)}/mo
          {listing.applicationFee ? ` · ${fmtCurrency(listing.applicationFee)} application fee` : ''}
          {listing.screeningFee ? ` · ${fmtCurrency(listing.screeningFee)} screening fee` : ''}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i < step ? 'bg-primary text-primary-foreground' :
              i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${i < step ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground -mt-2">{STEPS[step]}</p>

      {/* Step content */}
      <div className="space-y-3">
        {step === 0 && (
          <>
            <div><label className="block text-xs font-medium mb-1">Full name <span className="text-destructive">*</span></label>
              <input required type="text" value={formData.fullName} onChange={e => set('fullName', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Email <span className="text-destructive">*</span></label>
              <input required type="email" value={formData.email} onChange={e => set('email', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Phone <span className="text-destructive">*</span></label>
              <input required type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Date of birth</label>
              <input type="date" value={formData.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} className={inputClass} /></div>
          </>
        )}

        {step === 1 && (
          <>
            <div><label className="block text-xs font-medium mb-1">Current employer</label>
              <input type="text" value={formData.currentEmployer} onChange={e => set('currentEmployer', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Position / title</label>
              <input type="text" value={formData.position} onChange={e => set('position', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Annual income ($)</label>
              <input type="number" min="0" value={formData.annualIncome} onChange={e => set('annualIncome', e.target.value)} className={inputClass} placeholder="60000" /></div>
            <div><label className="block text-xs font-medium mb-1">Employment duration</label>
              <input type="text" value={formData.employmentDuration} onChange={e => set('employmentDuration', e.target.value)} className={inputClass} placeholder="2 years 3 months" /></div>
          </>
        )}

        {step === 2 && (
          <>
            <div><label className="block text-xs font-medium mb-1">Previous landlord name</label>
              <input type="text" value={formData.previousLandlordName} onChange={e => set('previousLandlordName', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Previous landlord phone</label>
              <input type="tel" value={formData.previousLandlordPhone} onChange={e => set('previousLandlordPhone', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Previous address</label>
              <input type="text" value={formData.previousAddress} onChange={e => set('previousAddress', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Duration at previous address</label>
              <input type="text" value={formData.durationAtAddress} onChange={e => set('durationAtAddress', e.target.value)} className={inputClass} placeholder="1 year 6 months" /></div>
            <div><label className="block text-xs font-medium mb-1">Reason for leaving</label>
              <textarea rows={2} value={formData.reasonForLeaving} onChange={e => set('reasonForLeaving', e.target.value)} className={`${inputClass} resize-none`} /></div>
          </>
        )}

        {step === 3 && (
          <>
            <div><label className="block text-xs font-medium mb-1">Number of occupants (including yourself)</label>
              <input type="number" min="1" value={formData.numberOfOccupants} onChange={e => set('numberOfOccupants', e.target.value)} className={inputClass} placeholder="1" /></div>
            <div><label className="block text-xs font-medium mb-1">Pet type (if any)</label>
              <input type="text" value={formData.petType} onChange={e => set('petType', e.target.value)} className={inputClass} placeholder="Dog, Cat…" /></div>
            {formData.petType && (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1">Breed</label>
                  <input type="text" value={formData.petBreed} onChange={e => set('petBreed', e.target.value)} className={inputClass} /></div>
                <div><label className="block text-xs font-medium mb-1">Weight (lbs)</label>
                  <input type="number" value={formData.petWeight} onChange={e => set('petWeight', e.target.value)} className={inputClass} /></div>
              </div>
            )}
            <div><label className="block text-xs font-medium mb-1">Vehicles (make/model/year)</label>
              <input type="text" value={formData.vehicles} onChange={e => set('vehicles', e.target.value)} className={inputClass} placeholder="2018 Honda Civic" /></div>
            <div><label className="block text-xs font-medium mb-1">Desired move-in date</label>
              <input type="date" value={formData.desiredMoveIn} onChange={e => set('desiredMoveIn', e.target.value)} className={inputClass} /></div>
            <div><label className="block text-xs font-medium mb-1">Desired lease term</label>
              <input type="text" value={formData.desiredLeaseTerm} onChange={e => set('desiredLeaseTerm', e.target.value)} className={inputClass} placeholder="12 months" /></div>
          </>
        )}

        {step === docsStepIndex && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please upload the following documents (PDF only, max 10MB each). All documents are required to complete your application.
            </p>
            {listing.requiredDocs.map(docType => {
              const uploaded = uploadedDocs[docType]
              const isUploading = uploadingDoc === docType
              const docError = docErrors[docType]
              const label = docTypeLabel(docType)
              return (
                <div key={docType} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{label}</span>
                    {uploaded && (
                      <span className="text-xs font-medium text-emerald-600">Uploaded</span>
                    )}
                  </div>
                  {uploaded ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[200px]">{uploaded.name}</span>
                      <button
                        type="button"
                        onClick={() => setUploadedDocs(d => { const n = { ...d }; delete n[docType]; return n })}
                        className="ml-2 text-muted-foreground hover:text-destructive underline flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className={`cursor-pointer inline-block rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                      isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                    }`}>
                      {isUploading ? 'Uploading…' : 'Choose PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={isUploading}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleDocFile(docType, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                  {docError && <p className="text-xs text-destructive">{docError}</p>}
                </div>
              )
            })}
          </div>
        )}

        {step === consentStepIndex && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 border p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground text-sm">Consent to screening</p>
              <p>By submitting this application, you authorize the property manager to obtain a consumer credit report and conduct a background check through a third-party screening service. This report may include credit history, rental history, criminal background, and eviction records. This authorization complies with the Fair Credit Reporting Act (FCRA).</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.screeningConsent}
                onChange={e => set('screeningConsent', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border flex-shrink-0"
              />
              <span className="text-sm"><strong>I consent</strong> to the screening described above. <span className="text-destructive">*</span></span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.truthfulnessAttestation}
                onChange={e => set('truthfulnessAttestation', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border flex-shrink-0"
              />
              <span className="text-sm"><strong>I certify</strong> that all information provided in this application is true and accurate. I understand that false statements may be grounds for rejection or lease termination. <span className="text-destructive">*</span></span>
            </label>
            {(listing.applicationFee || listing.screeningFee) && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.feeAcknowledgment}
                  onChange={e => set('feeAcknowledgment', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border flex-shrink-0"
                />
                <span className="text-sm">
                  <strong>I understand</strong> that my application will not be processed until I have paid the{' '}
                  {listing.applicationFee && listing.screeningFee
                    ? <>{fmtCurrency(listing.applicationFee)} application fee and {fmtCurrency(listing.screeningFee)} screening fee.</>
                    : listing.applicationFee
                    ? <>{fmtCurrency(listing.applicationFee)} application fee.</>
                    : <>{fmtCurrency(listing.screeningFee!)} screening fee.</>
                  }{' '}
                  <span className="text-destructive">*</span>
                </span>
              </label>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Back
          </button>
        ) : <div />}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              if (step === 0 && (!formData.fullName || !formData.email || !formData.phone)) {
                setError('Name, email, and phone are required.')
                return
              }
              // On docs step, require all docs to be uploaded
              if (step === docsStepIndex) {
                const missing = listing.requiredDocs.filter(d => !uploadedDocs[d])
                if (missing.length > 0) {
                  setError(`Please upload all required documents before continuing.`)
                  return
                }
              }
              setError(null)
              setStep(s => s + 1)
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !formData.screeningConsent || !formData.truthfulnessAttestation || (!!(listing.applicationFee || listing.screeningFee) && !formData.feeAcknowledgment)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        )}
      </div>
    </div>
  )
}
