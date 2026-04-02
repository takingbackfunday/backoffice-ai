import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface LeaseAdditionalCharge {
  label: string
  amount: number
  frequency: string // 'monthly' | 'one_time'
}

export interface LeaseRules {
  smokingAllowed?: boolean
  sublettingAllowed?: boolean
  petsAllowed?: boolean
  petNotes?: string
  parkingStall?: string
  parkingFee?: number
  storageUnit?: string
  storageFee?: number
  guestPolicy?: string
}

export interface LeaseContractData {
  // Parties
  ownerName: string
  tenantName: string
  tenantEmail: string
  tenantPhone?: string | null
  // Property
  propertyName: string
  propertyAddress?: string | null
  unitLabel: string
  // Lease terms
  startDate: string
  endDate: string
  monthlyRent: number
  securityDeposit?: number | null
  currency: string
  paymentDueDay: number
  lateFeeAmount?: number | null
  lateFeeGraceDays?: number | null
  // Addenda
  additionalCharges?: LeaseAdditionalCharge[]
  utilitiesIncluded?: string[]
  leaseRules?: LeaseRules
  // Contract meta
  contractNotes?: string | null
  generatedAt: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#111', padding: 56, backgroundColor: '#fff' },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#666', textAlign: 'center', marginBottom: 32 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e5e5', marginBottom: 20 },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  grid2: { flexDirection: 'row', gap: 24, marginBottom: 20 },
  col: { flex: 1 },
  label: { fontSize: 7, color: '#888', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  value: { fontSize: 9, color: '#111' },
  termRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  termLabel: { width: 180, fontSize: 9, color: '#555' },
  termValue: { flex: 1, fontSize: 9, color: '#111', fontFamily: 'Helvetica-Bold' },
  notesBox: { backgroundColor: '#f9f9f9', borderRadius: 4, padding: 12, marginBottom: 20 },
  notesText: { fontSize: 9, color: '#333', lineHeight: 1.5 },
  sigSection: { flexDirection: 'row', gap: 48, marginTop: 40 },
  sigCol: { flex: 1 },
  sigLabel: { fontSize: 8, color: '#888', marginBottom: 28 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: '#111', marginBottom: 6 },
  sigName: { fontSize: 9, color: '#111' },
  footer: { position: 'absolute', bottom: 32, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#aaa' },
})

/* ------------------------------------------------------------------ */
/*  PDF Component                                                       */
/* ------------------------------------------------------------------ */

function LeaseContractPDF({ data }: { data: LeaseContractData }) {
  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Title */}
        <Text style={S.title}>Residential Lease Agreement</Text>
        <Text style={S.subtitle}>Generated {fmtDate(data.generatedAt)}</Text>
        <View style={S.divider} />

        {/* Parties */}
        <Text style={S.sectionTitle}>Parties</Text>
        <View style={S.grid2}>
          <View style={S.col}>
            <Text style={S.label}>Landlord / Owner</Text>
            <Text style={S.value}>{data.ownerName}</Text>
          </View>
          <View style={S.col}>
            <Text style={S.label}>Tenant</Text>
            <Text style={S.value}>{data.tenantName}</Text>
            <Text style={[S.value, { color: '#555' }]}>{data.tenantEmail}</Text>
            {data.tenantPhone && <Text style={[S.value, { color: '#555' }]}>{data.tenantPhone}</Text>}
          </View>
        </View>

        {/* Property */}
        <Text style={S.sectionTitle}>Rental Property</Text>
        <View style={S.grid2}>
          <View style={S.col}>
            <Text style={S.label}>Property</Text>
            <Text style={S.value}>{data.propertyName}</Text>
            {data.propertyAddress && <Text style={[S.value, { color: '#555' }]}>{data.propertyAddress}</Text>}
          </View>
          <View style={S.col}>
            <Text style={S.label}>Unit</Text>
            <Text style={S.value}>{data.unitLabel}</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* Lease Terms */}
        <Text style={S.sectionTitle}>Lease Terms</Text>
        <View style={{ marginBottom: 20 }}>
          <View style={S.termRow}>
            <Text style={S.termLabel}>Lease Start</Text>
            <Text style={S.termValue}>{fmtDate(data.startDate)}</Text>
          </View>
          <View style={S.termRow}>
            <Text style={S.termLabel}>Lease End</Text>
            <Text style={S.termValue}>{fmtDate(data.endDate)}</Text>
          </View>
          <View style={S.termRow}>
            <Text style={S.termLabel}>Monthly Rent</Text>
            <Text style={S.termValue}>{fmt(data.monthlyRent, data.currency)}</Text>
          </View>
          {data.securityDeposit != null && (
            <View style={S.termRow}>
              <Text style={S.termLabel}>Security Deposit</Text>
              <Text style={S.termValue}>{fmt(data.securityDeposit, data.currency)}</Text>
            </View>
          )}
          <View style={S.termRow}>
            <Text style={S.termLabel}>Payment Due Day</Text>
            <Text style={S.termValue}>Day {data.paymentDueDay} of each month</Text>
          </View>
          {data.lateFeeAmount != null && (
            <View style={S.termRow}>
              <Text style={S.termLabel}>Late Fee</Text>
              <Text style={S.termValue}>
                {fmt(data.lateFeeAmount, data.currency)} after {data.lateFeeGraceDays ?? 5}-day grace period
              </Text>
            </View>
          )}
        </View>

        {/* Additional Charges */}
        {data.additionalCharges && data.additionalCharges.length > 0 && (() => {
          const monthlyExtras = data.additionalCharges
            .filter(c => c.frequency === 'monthly')
            .reduce((s, c) => s + c.amount, 0)
          return (
            <>
              <Text style={S.sectionTitle}>Additional Charges</Text>
              <View style={{ marginBottom: 20 }}>
                {data.additionalCharges.map((charge, i) => (
                  <View key={i} style={S.termRow}>
                    <Text style={S.termLabel}>{charge.label}</Text>
                    <Text style={S.termValue}>
                      {fmt(charge.amount, data.currency)}{charge.frequency === 'monthly' ? '/month' : ' (one-time)'}
                    </Text>
                  </View>
                ))}
                {monthlyExtras > 0 && (
                  <View style={[S.termRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                    <Text style={[S.termLabel, { fontFamily: 'Helvetica-Bold' }]}>Total Monthly (incl. rent)</Text>
                    <Text style={S.termValue}>{fmt(data.monthlyRent + monthlyExtras, data.currency)}/month</Text>
                  </View>
                )}
              </View>
            </>
          )
        })()}

        {/* Utilities Included */}
        {data.utilitiesIncluded && (
          <>
            <Text style={S.sectionTitle}>Utilities &amp; Inclusions</Text>
            <View style={{ marginBottom: 20 }}>
              <View style={S.termRow}>
                <Text style={S.termLabel}>Included in rent</Text>
                <Text style={S.termValue}>
                  {data.utilitiesIncluded.length > 0 ? data.utilitiesIncluded.join(', ') : 'None'}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Parking & Storage */}
        {data.leaseRules && (data.leaseRules.parkingStall || data.leaseRules.storageUnit) && (
          <>
            <Text style={S.sectionTitle}>Parking &amp; Storage</Text>
            <View style={{ marginBottom: 20 }}>
              {data.leaseRules.parkingStall && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Parking Stall</Text>
                  <Text style={S.termValue}>
                    {data.leaseRules.parkingStall}
                    {data.leaseRules.parkingFee ? ` — ${fmt(data.leaseRules.parkingFee, data.currency)}/month` : ''}
                  </Text>
                </View>
              )}
              {data.leaseRules.storageUnit && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Storage Unit</Text>
                  <Text style={S.termValue}>
                    {data.leaseRules.storageUnit}
                    {data.leaseRules.storageFee ? ` — ${fmt(data.leaseRules.storageFee, data.currency)}/month` : ''}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Rules & Policies */}
        {data.leaseRules && (
          data.leaseRules.petsAllowed !== undefined ||
          data.leaseRules.smokingAllowed !== undefined ||
          data.leaseRules.sublettingAllowed !== undefined ||
          data.leaseRules.guestPolicy
        ) && (
          <>
            <Text style={S.sectionTitle}>Rules &amp; Policies</Text>
            <View style={{ marginBottom: 20 }}>
              {data.leaseRules.petsAllowed !== undefined && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Pets</Text>
                  <Text style={S.termValue}>
                    {data.leaseRules.petsAllowed ? 'Allowed' : 'Not allowed'}
                    {data.leaseRules.petsAllowed && data.leaseRules.petNotes ? ` — ${data.leaseRules.petNotes}` : ''}
                  </Text>
                </View>
              )}
              {data.leaseRules.smokingAllowed !== undefined && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Smoking</Text>
                  <Text style={S.termValue}>{data.leaseRules.smokingAllowed ? 'Allowed' : 'Not allowed'}</Text>
                </View>
              )}
              {data.leaseRules.sublettingAllowed !== undefined && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Subletting</Text>
                  <Text style={S.termValue}>{data.leaseRules.sublettingAllowed ? 'Allowed' : 'Not allowed'}</Text>
                </View>
              )}
              {data.leaseRules.guestPolicy && (
                <View style={S.termRow}>
                  <Text style={S.termLabel}>Guest Policy</Text>
                  <Text style={S.termValue}>{data.leaseRules.guestPolicy}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Notes / Clauses */}
        {data.contractNotes && (
          <>
            <Text style={S.sectionTitle}>Additional Terms &amp; Conditions</Text>
            <View style={S.notesBox}>
              <Text style={S.notesText}>{data.contractNotes}</Text>
            </View>
          </>
        )}

        <View style={S.divider} />

        {/* Signatures */}
        <Text style={S.sectionTitle}>Signatures</Text>
        <View style={S.sigSection}>
          <View style={S.sigCol}>
            <Text style={S.sigLabel}>Landlord / Owner</Text>
            <View style={S.sigLine} />
            <Text style={S.sigName}>{data.ownerName}</Text>
            <Text style={[S.sigLabel, { marginTop: 4, marginBottom: 0 }]}>Date: ___________________</Text>
          </View>
          <View style={S.sigCol}>
            <Text style={S.sigLabel}>Tenant</Text>
            <View style={S.sigLine} />
            <Text style={S.sigName}>{data.tenantName}</Text>
            <Text style={[S.sigLabel, { marginTop: 4, marginBottom: 0 }]}>Date: ___________________</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{data.propertyName} — {data.unitLabel}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export async function generateLeaseContractPdf(data: LeaseContractData): Promise<Buffer> {
  const buffer = await renderToBuffer(<LeaseContractPDF data={data} />)
  return buffer
}
