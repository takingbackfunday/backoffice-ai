export interface ApplicationData {
  personal: {
    fullName: string
    email: string
    phone: string
    dateOfBirth?: string
    driverLicenseNumber?: string
    lastFourSSN?: string
    currentAddress?: string
    currentCity?: string
    currentState?: string
    currentZip?: string
    currentMovedInDate?: string
    currentMonthlyRent?: string
  }
  employment: {
    currentEmployer?: string
    position?: string
    annualIncome?: string
    employmentStartDate?: string
    managerName?: string
    managerPhone?: string
  }
  rentalHistory: {
    currentLandlordName?: string
    currentLandlordPhone?: string
    currentReasonForLeaving?: string
    previousAddress?: string
    previousLandlordName?: string
    previousLandlordPhone?: string
    previousRent?: string
    durationAtAddress?: string
    reasonForLeaving?: string
    previousAddress2?: string
    previousLandlordName2?: string
    previousLandlordPhone2?: string
    previousRent2?: string
    durationAtAddress2?: string
    reasonForLeaving2?: string
  }
  additional: {
    numberOfOccupants?: string
    dependents: Array<{ name: string; dateOfBirth: string }>
    pets: {
      type: string
      breed?: string
      weight?: string
      addendumAcknowledged?: boolean
    } | null
    vehicles: Array<{ makeModelYear: string; monthlyLoanPayment?: string }>
    desiredLeaseTerm?: string
  }
  selfDisclosure: {
    declaredBankruptcy: boolean | null
    everEvicted: boolean | null
    latePastYear: boolean | null
    refusedToPayRent: boolean | null
    isSmoker: boolean | null
  }
  coApplicant: null | {
    fullName: string
    dateOfBirth?: string
    driverLicenseNumber?: string
    lastFourSSN?: string
    phone?: string
    workPhone?: string
    email?: string
    currentEmployer?: string
    position?: string
    employmentStartDate?: string
    monthlyIncome?: string
    managerName?: string
    managerPhone?: string
  }
}
