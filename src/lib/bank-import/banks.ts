export type BankKey = 'chase' | 'n26' | 'fakebank'
export type BrowserRegion = 'us' | 'eu'
export type BankDateFormat = 'MM/DD/YYYY' | 'DD.MM.YYYY'

export interface BankConfig {
  key: BankKey
  displayName: string
  loginUrl: string
  allowedHostSuffixes: string[]
  allowInsecureLocalhost: boolean
  region: BrowserRegion
  proxyCountryCode: 'us' | 'de'
  dateFormat: BankDateFormat
  maxRangeDays: number | null
  loginUrlPatterns: RegExp[]
  authenticatedUrlPatterns: RegExp[]
  askAccountHint: boolean
  navigationHints: string
}

// UNVERIFIED: calibrate the URL patterns and navigation hints with real accounts.
const CHASE: BankConfig = {
  key: 'chase',
  displayName: 'Chase',
  loginUrl: 'https://secure.chase.com/web/auth/dashboard',
  allowedHostSuffixes: ['chase.com'],
  allowInsecureLocalhost: false,
  region: 'us',
  proxyCountryCode: 'us',
  dateFormat: 'MM/DD/YYYY',
  maxRangeDays: null,
  loginUrlPatterns: [/\/logon/i, /\/auth\/#?\/?logon/i],
  authenticatedUrlPatterns: [/secure\.chase\.com\/web\/auth\/dashboard#\/dashboard/i],
  askAccountHint: true,
  navigationHints: [
    'From the Accounts overview, open the account the user chose (match the hint / last 4 digits if given).',
    'On the account activity page, find the download icon or link (often labelled "Download account activity").',
    'In the download dialog: choose the spreadsheet/CSV file type, choose "Choose a date range" (or similar),',
    'fill the From and To dates with fill_date, then click the Download button.',
    'Never use Pay, Transfer, Zelle or Wire features.',
  ].join(' '),
}

const N26: BankConfig = {
  key: 'n26',
  displayName: 'N26',
  loginUrl: 'https://app.n26.com/login',
  allowedHostSuffixes: ['n26.com'],
  allowInsecureLocalhost: false,
  region: 'eu',
  proxyCountryCode: 'de',
  dateFormat: 'DD.MM.YYYY',
  maxRangeDays: null,
  loginUrlPatterns: [/app\.n26\.com\/login/i],
  authenticatedUrlPatterns: [/app\.n26\.com\/(feed|account|home|dashboard)/i],
  askAccountHint: false,
  navigationHints: [
    'Open the main account. Look for a CSV export of transactions: it may be called "Download CSV",',
    '"Export", "Downloads" or be inside an account or overflow (⋯) menu, or under Statements/Documents.',
    'Prefer CSV transaction exports, NOT monthly PDF statements.',
    'Set the start and end dates with fill_date (or the date picker), then click download/export.',
    'The UI may be in German: "Herunterladen", "Exportieren", "Umsätze", "Kontoauszüge", "Von", "Bis".',
  ].join(' '),
}

export function isFakeBankEnabled(): boolean {
  return process.env.BANK_IMPORT_FAKEBANK === '1' && process.env.NODE_ENV !== 'production'
}

function fakeBank(): BankConfig {
  const base = process.env.BANK_IMPORT_FAKEBANK_URL ?? 'http://localhost:4599'
  return {
    key: 'fakebank',
    displayName: 'Fake Bank',
    loginUrl: `${base}/login`,
    allowedHostSuffixes: ['localhost'],
    allowInsecureLocalhost: true,
    region: 'us',
    proxyCountryCode: 'us',
    dateFormat: 'MM/DD/YYYY',
    maxRangeDays: null,
    loginUrlPatterns: [/\/login/i],
    authenticatedUrlPatterns: [/\/dashboard/i],
    askAccountHint: false,
    navigationHints: 'Open the account activity, click "Download account activity", choose CSV, fill From/To with fill_date, click Download.',
  }
}

export function getBank(key: string): BankConfig | null {
  if (key === 'chase') return CHASE
  if (key === 'n26') return N26
  if (key === 'fakebank' && isFakeBankEnabled()) return fakeBank()
  return null
}

/** Map an InstitutionSchema.name to a supported bank, or null. */
export function resolveBankKey(institutionName: string): BankKey | null {
  const name = institutionName.trim()
  if (/^chase\b/i.test(name)) return 'chase'
  if (/^n26\b/i.test(name)) return 'n26'
  if (/^fake ?bank\b/i.test(name) && isFakeBankEnabled()) return 'fakebank'
  return null
}
