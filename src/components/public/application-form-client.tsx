'use client'

import { useMemo, useState } from 'react'
import { useUploadThing } from '@/lib/uploadthing-client'
import { docTypeLabel } from '@/lib/doc-types'
import type { ApplicationData } from '@/types/application-data'

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
      workspace: { name: string }
    }
  }
}

interface Props {
  listing: SerializedListing
}

interface Dependent { name: string; dateOfBirth: string }
interface Vehicle { makeModelYear: string; monthlyLoanPayment: string }
interface CoApplicantForm {
  fullName: string
  dateOfBirth: string
  driverLicenseNumber: string
  lastFourSSN: string
  phone: string
  workPhone: string
  email: string
  currentEmployer: string
  position: string
  employmentStartDate: string
  monthlyIncome: string
  managerName: string
  managerPhone: string
}

interface FormData {
  // Step 1 — Personal
  fullName: string
  email: string
  phone: string
  dateOfBirth: string
  driverLicenseNumber: string
  lastFourSSN: string
  currentAddress: string
  currentCity: string
  currentState: string
  currentZip: string
  currentMovedInDate: string
  currentMonthlyRent: string
  // Step 2 — Employment
  currentEmployer: string
  position: string
  annualIncome: string
  employmentStartDate: string
  managerName: string
  managerPhone: string
  // Step 3 — Rental history
  currentLandlordName: string
  currentLandlordPhone: string
  currentReasonForLeaving: string
  previousAddress: string
  previousLandlordName: string
  previousLandlordPhone: string
  previousRent: string
  durationAtAddress: string
  reasonForLeaving: string
  previousAddress2: string
  previousLandlordName2: string
  previousLandlordPhone2: string
  previousRent2: string
  durationAtAddress2: string
  reasonForLeaving2: string
  // Step 4 — Additional
  numberOfOccupants: string
  petType: string
  petBreed: string
  petWeight: string
  petAddendumAcknowledged: boolean
  desiredMoveIn: string
  desiredLeaseTerm: string
  hasCoApplicant: boolean
  // Step 5 — Self-disclosure
  declaredBankruptcy: boolean | null
  everEvicted: boolean | null
  latePastYear: boolean | null
  refusedToPayRent: boolean | null
  isSmoker: boolean | null
  // Consent
  screeningConsent: boolean
  truthfulnessAttestation: boolean
  feeAcknowledgment: boolean
}

interface UploadedDoc {
  url: string
  name: string
  size: number
}

const DISCLOSURE_QUESTIONS: { key: keyof Pick<FormData, 'declaredBankruptcy' | 'everEvicted' | 'latePastYear' | 'refusedToPayRent' | 'isSmoker'>; text: string }[] = [
  { key: 'declaredBankruptcy', text: 'Have you declared bankruptcy in the past 7 years?' },
  { key: 'everEvicted', text: 'Have you ever been evicted from a rental residence?' },
  { key: 'latePastYear', text: 'Have you had 2 or more late rental payments in the past year?' },
  { key: 'refusedToPayRent', text: 'Have you ever willfully refused to pay rent when due?' },
  { key: 'isSmoker', text: 'Are you a smoker of cigarettes, marijuana, or other substances?' },
]

const DOCS_STEP = 'Documents'
const CONSENT_STEP = 'Review & consent'

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function ApplicationFormClient({ listing }: Props) {
  const hasRequiredDocs = listing.requiredDocs.length > 0

  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    fullName: '', email: '', phone: '', dateOfBirth: '',
    driverLicenseNumber: '', lastFourSSN: '',
    currentAddress: '', currentCity: '', currentState: '', currentZip: '',
    currentMovedInDate: '', currentMonthlyRent: '',
    currentEmployer: '', position: '', annualIncome: '', employmentStartDate: '',
    managerName: '', managerPhone: '',
    currentLandlordName: '', currentLandlordPhone: '', currentReasonForLeaving: '',
    previousAddress: '', previousLandlordName: '', previousLandlordPhone: '',
    previousRent: '', durationAtAddress: '', reasonForLeaving: '',
    previousAddress2: '', previousLandlordName2: '', previousLandlordPhone2: '',
    previousRent2: '', durationAtAddress2: '', reasonForLeaving2: '',
    numberOfOccupants: '', petType: '', petBreed: '', petWeight: '',
    petAddendumAcknowledged: false,
    desiredMoveIn: '', desiredLeaseTerm: '',
    hasCoApplicant: false,
    declaredBankruptcy: null, everEvicted: null, latePastYear: null,
    refusedToPayRent: null, isSmoker: null,
    screeningConsent: false, truthfulnessAttestation: false, feeAcknowledgment: false,
  })

  const [dependents, setDependents] = useState<Dependent[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [coApplicant, setCoApplicant] = useState<CoApplicantForm>({
    fullName: '', dateOfBirth: '', driverLicenseNumber: '', lastFourSSN: '',
    phone: '', workPhone: '', email: '',
    currentEmployer: '', position: '', employmentStartDate: '',
    monthlyIncome: '', managerName: '', managerPhone: '',
  })

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({})
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [docErrors, setDocErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { startUpload } = useUploadThing('applicantDocUploader')

  const STEPS = useMemo(() => {
    const base = [
      'Personal info',
      'Employment',
      'Rental history',
      'Additional details',
      'Screening questions',
    ]
    if (formData.hasCoApplicant) base.push('Co-applicant')
    if (hasRequiredDocs) base.push(DOCS_STEP)
    base.push(CONSENT_STEP)
    return base
  }, [formData.hasCoApplicant, hasRequiredDocs])

  const docsStepIndex = useMemo(
    () => hasRequiredDocs ? STEPS.indexOf(DOCS_STEP) : -1,
    [STEPS, hasRequiredDocs]
  )
  const consentStepIndex = useMemo(() => STEPS.indexOf(CONSENT_STEP), [STEPS])

  function set<K extends keyof FormData>(field: K, value: FormData[K]) {
    setFormData(f => ({ ...f, [field]: value }))
  }

  function setCoApp<K extends keyof CoApplicantForm>(field: K, value: string) {
    setCoApplicant(c => ({ ...c, [field]: value }))
  }

  function addDependent() {
    setDependents(d => [...d, { name: '', dateOfBirth: '' }])
  }
  function removeDependent(i: number) {
    setDependents(d => d.filter((_, idx) => idx !== i))
  }
  function updateDependent(i: number, field: keyof Dependent, value: string) {
    setDependents(d => d.map((dep, idx) => idx === i ? { ...dep, [field]: value } : dep))
  }

  function addVehicle() {
    setVehicles(v => [...v, { makeModelYear: '', monthlyLoanPayment: '' }])
  }
  function removeVehicle(i: number) {
    setVehicles(v => v.filter((_, idx) => idx !== i))
  }
  function updateVehicle(i: number, field: keyof Vehicle, value: string) {
    setVehicles(v => v.map((veh, idx) => idx === i ? { ...veh, [field]: value } : veh))
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
    const hasPets = !!formData.petType
    if (!formData.screeningConsent || !formData.truthfulnessAttestation) {
      setError('You must agree to all required checkboxes to proceed.')
      return
    }
    if (hasFees && !formData.feeAcknowledgment) {
      setError('You must acknowledge the application fee to proceed.')
      return
    }
    if (hasPets && !formData.petAddendumAcknowledged) {
      setError('You must acknowledge the pet addendum to proceed.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const applicationData: ApplicationData = {
        personal: {
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth || undefined,
          driverLicenseNumber: formData.driverLicenseNumber || undefined,
          lastFourSSN: formData.lastFourSSN || undefined,
          currentAddress: formData.currentAddress || undefined,
          currentCity: formData.currentCity || undefined,
          currentState: formData.currentState || undefined,
          currentZip: formData.currentZip || undefined,
          currentMovedInDate: formData.currentMovedInDate || undefined,
          currentMonthlyRent: formData.currentMonthlyRent || undefined,
        },
        employment: {
          currentEmployer: formData.currentEmployer || undefined,
          position: formData.position || undefined,
          annualIncome: formData.annualIncome || undefined,
          employmentStartDate: formData.employmentStartDate || undefined,
          managerName: formData.managerName || undefined,
          managerPhone: formData.managerPhone || undefined,
        },
        rentalHistory: {
          currentLandlordName: formData.currentLandlordName || undefined,
          currentLandlordPhone: formData.currentLandlordPhone || undefined,
          currentReasonForLeaving: formData.currentReasonForLeaving || undefined,
          previousAddress: formData.previousAddress || undefined,
          previousLandlordName: formData.previousLandlordName || undefined,
          previousLandlordPhone: formData.previousLandlordPhone || undefined,
          previousRent: formData.previousRent || undefined,
          durationAtAddress: formData.durationAtAddress || undefined,
          reasonForLeaving: formData.reasonForLeaving || undefined,
          previousAddress2: formData.previousAddress2 || undefined,
          previousLandlordName2: formData.previousLandlordName2 || undefined,
          previousLandlordPhone2: formData.previousLandlordPhone2 || undefined,
          previousRent2: formData.previousRent2 || undefined,
          durationAtAddress2: formData.durationAtAddress2 || undefined,
          reasonForLeaving2: formData.reasonForLeaving2 || undefined,
        },
        additional: {
          numberOfOccupants: formData.numberOfOccupants || undefined,
          dependents,
          pets: formData.petType
            ? {
                type: formData.petType,
                breed: formData.petBreed || undefined,
                weight: formData.petWeight || undefined,
                addendumAcknowledged: formData.petAddendumAcknowledged,
              }
            : null,
          vehicles,
          desiredLeaseTerm: formData.desiredLeaseTerm || undefined,
        },
        selfDisclosure: {
          declaredBankruptcy: formData.declaredBankruptcy,
          everEvicted: formData.everEvicted,
          latePastYear: formData.latePastYear,
          refusedToPayRent: formData.refusedToPayRent,
          isSmoker: formData.isSmoker,
        },
        coApplicant: formData.hasCoApplicant
          ? {
              fullName: coApplicant.fullName,
              dateOfBirth: coApplicant.dateOfBirth || undefined,
              driverLicenseNumber: coApplicant.driverLicenseNumber || undefined,
              lastFourSSN: coApplicant.lastFourSSN || undefined,
              phone: coApplicant.phone || undefined,
              workPhone: coApplicant.workPhone || undefined,
              email: coApplicant.email || undefined,
              currentEmployer: coApplicant.currentEmployer || undefined,
              position: coApplicant.position || undefined,
              employmentStartDate: coApplicant.employmentStartDate || undefined,
              monthlyIncome: coApplicant.monthlyIncome || undefined,
              managerName: coApplicant.managerName || undefined,
              managerPhone: coApplicant.managerPhone || undefined,
            }
          : null,
      }

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
  const labelClass = 'block text-xs font-medium mb-1'

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
          <strong>{listing.unit.propertyProfile.workspace.name}</strong>. You will hear from the property manager soon.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">{listing.unit.propertyProfile.workspace.name} · {listing.unit.unitLabel}</p>
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
          <div key={label} className="flex items-center gap-1 flex-1">
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

        {/* ── Step 1: Personal Info ── */}
        {step === 0 && (
          <>
            <div><label className={labelClass}>Full name <span className="text-destructive">*</span></label>
              <input type="text" value={formData.fullName} onChange={e => set('fullName', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Email <span className="text-destructive">*</span></label>
              <input type="email" value={formData.email} onChange={e => set('email', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Mobile phone <span className="text-destructive">*</span></label>
              <input type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Date of birth</label>
              <input type="date" value={formData.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Driver&apos;s license #</label>
                <input type="text" value={formData.driverLicenseNumber} onChange={e => set('driverLicenseNumber', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last 4 digits of SSN</label>
                <input
                  type="text"
                  value={formData.lastFourSSN}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                    set('lastFourSSN', v)
                  }}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="XXXX"
                  className={inputClass}
                /></div>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">Current address</p>
            <div><label className={labelClass}>Street address</label>
              <input type="text" value={formData.currentAddress} onChange={e => set('currentAddress', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1"><label className={labelClass}>City</label>
                <input type="text" value={formData.currentCity} onChange={e => set('currentCity', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>State</label>
                <input type="text" value={formData.currentState} onChange={e => set('currentState', e.target.value)} className={inputClass} placeholder="TX" maxLength={2} /></div>
              <div><label className={labelClass}>Zip</label>
                <input type="text" value={formData.currentZip} onChange={e => set('currentZip', e.target.value)} className={inputClass} placeholder="75001" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Move-in date</label>
                <input type="date" value={formData.currentMovedInDate} onChange={e => set('currentMovedInDate', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Current monthly rent ($)</label>
                <input type="number" min="0" value={formData.currentMonthlyRent} onChange={e => set('currentMonthlyRent', e.target.value)} className={inputClass} placeholder="0" /></div>
            </div>
          </>
        )}

        {/* ── Step 2: Employment ── */}
        {step === 1 && (
          <>
            <div><label className={labelClass}>Current employer</label>
              <input type="text" value={formData.currentEmployer} onChange={e => set('currentEmployer', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Position / title</label>
              <input type="text" value={formData.position} onChange={e => set('position', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Annual income ($)</label>
                <input type="number" min="0" value={formData.annualIncome} onChange={e => set('annualIncome', e.target.value)} className={inputClass} placeholder="60000" /></div>
              <div><label className={labelClass}>Start date (MM/YYYY)</label>
                <input
                  type="text"
                  value={formData.employmentStartDate}
                  onChange={e => set('employmentStartDate', e.target.value)}
                  className={inputClass}
                  placeholder="03/2022"
                  maxLength={7}
                /></div>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">Manager / supervisor contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Manager name</label>
                <input type="text" value={formData.managerName} onChange={e => set('managerName', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Manager phone</label>
                <input type="tel" value={formData.managerPhone} onChange={e => set('managerPhone', e.target.value)} className={inputClass} /></div>
            </div>
          </>
        )}

        {/* ── Step 3: Rental History ── */}
        {step === 2 && (
          <>
            <p className="text-xs text-muted-foreground font-medium">Current address — landlord info</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Landlord / owner name</label>
                <input type="text" value={formData.currentLandlordName} onChange={e => set('currentLandlordName', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Landlord phone</label>
                <input type="tel" value={formData.currentLandlordPhone} onChange={e => set('currentLandlordPhone', e.target.value)} className={inputClass} /></div>
            </div>
            <div><label className={labelClass}>Reason for leaving</label>
              <textarea rows={2} value={formData.currentReasonForLeaving} onChange={e => set('currentReasonForLeaving', e.target.value)} className={`${inputClass} resize-none`} /></div>

            <div className="border-t pt-3 mt-1">
              <p className="text-xs text-muted-foreground font-medium mb-3">Previous address 1 (last 5 years)</p>
              <div className="space-y-3">
                <div><label className={labelClass}>Address</label>
                  <input type="text" value={formData.previousAddress} onChange={e => set('previousAddress', e.target.value)} className={inputClass} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Landlord name</label>
                    <input type="text" value={formData.previousLandlordName} onChange={e => set('previousLandlordName', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Landlord phone</label>
                    <input type="tel" value={formData.previousLandlordPhone} onChange={e => set('previousLandlordPhone', e.target.value)} className={inputClass} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Monthly rent ($)</label>
                    <input type="number" min="0" value={formData.previousRent} onChange={e => set('previousRent', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Duration there</label>
                    <input type="text" value={formData.durationAtAddress} onChange={e => set('durationAtAddress', e.target.value)} className={inputClass} placeholder="1 year 6 months" /></div>
                </div>
                <div><label className={labelClass}>Reason for leaving</label>
                  <textarea rows={2} value={formData.reasonForLeaving} onChange={e => set('reasonForLeaving', e.target.value)} className={`${inputClass} resize-none`} /></div>
              </div>
            </div>

            <div className="border-t pt-3 mt-1">
              <p className="text-xs text-muted-foreground font-medium mb-3">Previous address 2 (optional)</p>
              <div className="space-y-3">
                <div><label className={labelClass}>Address</label>
                  <input type="text" value={formData.previousAddress2} onChange={e => set('previousAddress2', e.target.value)} className={inputClass} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Landlord name</label>
                    <input type="text" value={formData.previousLandlordName2} onChange={e => set('previousLandlordName2', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Landlord phone</label>
                    <input type="tel" value={formData.previousLandlordPhone2} onChange={e => set('previousLandlordPhone2', e.target.value)} className={inputClass} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Monthly rent ($)</label>
                    <input type="number" min="0" value={formData.previousRent2} onChange={e => set('previousRent2', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Duration there</label>
                    <input type="text" value={formData.durationAtAddress2} onChange={e => set('durationAtAddress2', e.target.value)} className={inputClass} placeholder="1 year 6 months" /></div>
                </div>
                <div><label className={labelClass}>Reason for leaving</label>
                  <textarea rows={2} value={formData.reasonForLeaving2} onChange={e => set('reasonForLeaving2', e.target.value)} className={`${inputClass} resize-none`} /></div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 4: Additional Details ── */}
        {step === 3 && (
          <>
            <div><label className={labelClass}>Number of occupants (including yourself)</label>
              <input type="number" min="1" value={formData.numberOfOccupants} onChange={e => set('numberOfOccupants', e.target.value)} className={inputClass} placeholder="1" /></div>

            {/* Dependents */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelClass} mb-0`}>Dependents</label>
                <button type="button" onClick={addDependent} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
              {dependents.length === 0 && (
                <p className="text-xs text-muted-foreground">None — click + Add if you have dependents</p>
              )}
              <div className="space-y-2">
                {dependents.map((dep, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      type="text"
                      placeholder="Full name"
                      value={dep.name}
                      onChange={e => updateDependent(i, 'name', e.target.value)}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="date"
                      value={dep.dateOfBirth}
                      onChange={e => updateDependent(i, 'dateOfBirth', e.target.value)}
                      className={`${inputClass} w-36`}
                    />
                    <button type="button" onClick={() => removeDependent(i)} className="text-muted-foreground hover:text-destructive text-lg leading-none mt-2">×</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Pets */}
            <div><label className={labelClass}>Pet type (if any)</label>
              <input type="text" value={formData.petType} onChange={e => set('petType', e.target.value)} className={inputClass} placeholder="Dog, Cat…" /></div>
            {formData.petType && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={labelClass}>Breed</label>
                    <input type="text" value={formData.petBreed} onChange={e => set('petBreed', e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Weight (lbs)</label>
                    <input type="number" value={formData.petWeight} onChange={e => set('petWeight', e.target.value)} className={inputClass} /></div>
                </div>
              </>
            )}

            {/* Vehicles */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelClass} mb-0`}>Vehicles</label>
                <button type="button" onClick={addVehicle} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
              {vehicles.length === 0 && (
                <p className="text-xs text-muted-foreground">None — click + Add if you have vehicles</p>
              )}
              <div className="space-y-2">
                {vehicles.map((veh, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      type="text"
                      placeholder="Make/Model/Year (e.g. 2018 Honda Civic)"
                      value={veh.makeModelYear}
                      onChange={e => updateVehicle(i, 'makeModelYear', e.target.value)}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="number"
                      placeholder="Loan $/mo"
                      min="0"
                      value={veh.monthlyLoanPayment}
                      onChange={e => updateVehicle(i, 'monthlyLoanPayment', e.target.value)}
                      className={`${inputClass} w-28`}
                    />
                    <button type="button" onClick={() => removeVehicle(i)} className="text-muted-foreground hover:text-destructive text-lg leading-none mt-2">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Desired move-in date</label>
                <input type="date" value={formData.desiredMoveIn} onChange={e => set('desiredMoveIn', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Desired lease term</label>
                <input type="text" value={formData.desiredLeaseTerm} onChange={e => set('desiredLeaseTerm', e.target.value)} className={inputClass} placeholder="12 months" /></div>
            </div>

            <div className="border-t pt-3 mt-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasCoApplicant}
                  onChange={e => set('hasCoApplicant', e.target.checked)}
                  className="h-4 w-4 rounded border flex-shrink-0"
                />
                <span className="text-sm">I have a co-applicant (add their information on the next step)</span>
              </label>
            </div>
          </>
        )}

        {/* ── Step 5: Self-Disclosure ── */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please answer all questions honestly. These answers are used as part of the screening process.</p>
            {DISCLOSURE_QUESTIONS.map(q => (
              <div key={q.key} className="rounded-lg border p-3 space-y-2">
                <p className="text-sm">{q.text} <span className="text-destructive">*</span></p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={q.key}
                      checked={formData[q.key] === true}
                      onChange={() => set(q.key, true)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={q.key}
                      checked={formData[q.key] === false}
                      onChange={() => set(q.key, false)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Step 6: Co-Applicant (conditional) ── */}
        {formData.hasCoApplicant && step === 5 && (
          <>
            <p className="text-sm text-muted-foreground">Provide information for your co-applicant.</p>
            <div><label className={labelClass}>Full name <span className="text-destructive">*</span></label>
              <input type="text" value={coApplicant.fullName} onChange={e => setCoApp('fullName', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Email</label>
              <input type="email" value={coApplicant.email} onChange={e => setCoApp('email', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Mobile phone</label>
                <input type="tel" value={coApplicant.phone} onChange={e => setCoApp('phone', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Work phone</label>
                <input type="tel" value={coApplicant.workPhone} onChange={e => setCoApp('workPhone', e.target.value)} className={inputClass} /></div>
            </div>
            <div><label className={labelClass}>Date of birth</label>
              <input type="date" value={coApplicant.dateOfBirth} onChange={e => setCoApp('dateOfBirth', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Driver&apos;s license #</label>
                <input type="text" value={coApplicant.driverLicenseNumber} onChange={e => setCoApp('driverLicenseNumber', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Last 4 digits of SSN</label>
                <input
                  type="text"
                  value={coApplicant.lastFourSSN}
                  onChange={e => setCoApp('lastFourSSN', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="XXXX"
                  className={inputClass}
                /></div>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">Co-applicant employment</p>
            <div><label className={labelClass}>Employer</label>
              <input type="text" value={coApplicant.currentEmployer} onChange={e => setCoApp('currentEmployer', e.target.value)} className={inputClass} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Position / title</label>
                <input type="text" value={coApplicant.position} onChange={e => setCoApp('position', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Monthly income ($)</label>
                <input type="number" min="0" value={coApplicant.monthlyIncome} onChange={e => setCoApp('monthlyIncome', e.target.value)} className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Start date (MM/YYYY)</label>
                <input type="text" value={coApplicant.employmentStartDate} onChange={e => setCoApp('employmentStartDate', e.target.value)} className={inputClass} placeholder="03/2022" maxLength={7} /></div>
            </div>
            <p className="text-xs text-muted-foreground font-medium pt-1">Co-applicant manager / supervisor</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelClass}>Manager name</label>
                <input type="text" value={coApplicant.managerName} onChange={e => setCoApp('managerName', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Manager phone</label>
                <input type="tel" value={coApplicant.managerPhone} onChange={e => setCoApp('managerPhone', e.target.value)} className={inputClass} /></div>
            </div>
          </>
        )}

        {/* ── Documents step ── */}
        {step === docsStepIndex && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please upload the following documents (PDF only, max 10MB each). All documents are required to complete your application.
            </p>
            {listing.requiredDocs.map(docType => {
              const uploaded = uploadedDocs[docType]
              const isUploading = uploadingDoc === docType
              const docError = docErrors[docType]
              return (
                <div key={docType} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{docTypeLabel(docType)}</span>
                    {uploaded && <span className="text-xs font-medium text-emerald-600">Uploaded</span>}
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
                    <label className={`cursor-pointer inline-block rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'}`}>
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

        {/* ── Consent step ── */}
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
            {formData.petType && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.petAddendumAcknowledged}
                  onChange={e => set('petAddendumAcknowledged', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border flex-shrink-0"
                />
                <span className="text-sm"><strong>I acknowledge</strong> that pets are subject to a pet addendum agreement and a monthly pet fee starting on move-in. <span className="text-destructive">*</span></span>
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
              if (step === 4) {
                const unanswered = DISCLOSURE_QUESTIONS.filter(q => formData[q.key] === null)
                if (unanswered.length > 0) {
                  setError('Please answer all screening questions before continuing.')
                  return
                }
              }
              if (formData.hasCoApplicant && step === 5 && !coApplicant.fullName) {
                setError('Co-applicant full name is required.')
                return
              }
              if (step === docsStepIndex) {
                const missing = listing.requiredDocs.filter(d => !uploadedDocs[d])
                if (missing.length > 0) {
                  setError('Please upload all required documents before continuing.')
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
            disabled={
              submitting ||
              !formData.screeningConsent ||
              !formData.truthfulnessAttestation ||
              (!!(listing.applicationFee || listing.screeningFee) && !formData.feeAcknowledgment) ||
              (!!formData.petType && !formData.petAddendumAcknowledged)
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
        )}
      </div>
    </div>
  )
}
