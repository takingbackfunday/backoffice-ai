/**
 * Migration script for gmasproperties@outlook.com (Pop)
 *
 * Run with:
 *   DIRECT_URL="<neon-direct-url>" npx tsx prisma/migrate-gmas.ts
 *
 * What it does:
 *   1. Resolves the Clerk userId for gmasproperties@outlook.com
 *   2. Creates his CategoryGroups + Categories (Schedule E / property taxonomy)
 *   3. Creates InstitutionSchemas + Accounts for all his bank accounts
 *   4. Creates Projects (PROPERTY type) for all 25 properties
 *   5. Imports all cleaned transactions directly (no CSV needed)
 *
 * Data cleaning applied:
 *   - Drops rows where Category is a bare number (summary rows)
 *   - Merges Entertainment/Food & Drink/Meal → "Meals"
 *   - Merges Fee/Interest → Bank Fee
 */

import { PrismaClient, AccountType } from '../src/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// ── CONFIG ────────────────────────────────────────────────────────────────────

// Pre-converted from Excel via: python3 prisma/convert-gmas-excel.py
const JSON_PATH = path.resolve(__dirname, 'gmas-transactions.json')

// Clerk userId for gmasproperties@outlook.com
// Set this after you retrieve it (see step 0 below)
const TARGET_USER_ID = process.env.GMAS_USER_ID || ''

// ── CATEGORY MAPPING ──────────────────────────────────────────────────────────

/**
 * Maps his (Category, Sub Category) → { groupName, categoryName, scheduleRef, taxType }
 * Built from the unique combinations we extracted earlier.
 */
interface CategoryDef {
  groupName: string
  categoryName: string
  scheduleRef: string // "E" | "C,E" | "C" | "none"
  taxType: string     // "income" | "expense" | "non_deductible"
}

const CATEGORY_MAP: Record<string, CategoryDef> = {
  // Income
  'Income|Rent':                    { groupName: 'Rental income',              categoryName: 'Rents received',               scheduleRef: 'E',   taxType: 'income' },
  'Income|Security Deposit':        { groupName: 'Rental income',              categoryName: 'Security deposit',             scheduleRef: 'E',   taxType: 'income' },
  'Interest Income|Interest Income':{ groupName: 'Other business income',      categoryName: 'Interest income',              scheduleRef: 'C',   taxType: 'income' },

  // Maintenance / Repairs
  'Maintenance|Cleaning':           { groupName: 'Cleaning & maintenance',     categoryName: 'Regular cleaning service',     scheduleRef: 'E',   taxType: 'expense' },
  'Maintenance|Site Cleaning':      { groupName: 'Cleaning & maintenance',     categoryName: 'Turnover cleaning',            scheduleRef: 'E',   taxType: 'expense' },
  'Maintenance|Yard Work':          { groupName: 'Landscaping & grounds',      categoryName: 'Lawn care & mowing',           scheduleRef: 'E',   taxType: 'expense' },
  'Repair|Backyard Deck':           { groupName: 'Repairs & maintenance',      categoryName: 'Building / facility repairs',  scheduleRef: 'C,E', taxType: 'expense' },
  'Repair|Electrical':              { groupName: 'Repairs & maintenance',      categoryName: 'Electrical',                   scheduleRef: 'C,E', taxType: 'expense' },
  'Repair|Repair & Maintenance':    { groupName: 'Repairs & maintenance',      categoryName: 'Repair & maintenance',         scheduleRef: 'C,E', taxType: 'expense' },
  'Repair|Vehicle Repair':          { groupName: 'Car & truck expenses',       categoryName: 'Repairs & maintenance',        scheduleRef: 'C',   taxType: 'expense' },
  'Repair|Water Leaks Mitigation':  { groupName: 'Repairs & maintenance',      categoryName: 'Plumbing',                     scheduleRef: 'C,E', taxType: 'expense' },

  // Insurance
  'Insurance|Auto Policy':          { groupName: 'Insurance',                  categoryName: 'Auto insurance',               scheduleRef: 'C,E', taxType: 'expense' },
  'Insurance|Home Policy':          { groupName: 'Insurance',                  categoryName: 'Landlord / rental dwelling policy', scheduleRef: 'C,E', taxType: 'expense' },
  'Insurance|Business Liability Policy': { groupName: 'Insurance',             categoryName: 'General liability',            scheduleRef: 'C,E', taxType: 'expense' },

  // Property Tax
  'Property Tax|Real Estate Tax':   { groupName: 'Taxes & licenses',           categoryName: 'Property tax',                 scheduleRef: 'C,E', taxType: 'expense' },
  'Tax|Franchise Tax':              { groupName: 'Taxes & licenses',           categoryName: 'Franchise tax',                scheduleRef: 'C,E', taxType: 'expense' },

  // HOA
  'HOA Fee|Maintenance Due':        { groupName: 'HOA & condo fees',           categoryName: 'HOA dues',                     scheduleRef: 'E',   taxType: 'expense' },

  // Professional Services
  'Professional SVC|Office Expense':    { groupName: 'Legal & professional services', categoryName: 'Accounting & bookkeeping', scheduleRef: 'C,E', taxType: 'expense' },
  'Professional SVC|Payment/Credit':    { groupName: 'Legal & professional services', categoryName: 'Consulting fees',          scheduleRef: 'C,E', taxType: 'expense' },
  'Professional SVC|Real Estate':       { groupName: 'Legal & professional services', categoryName: 'Real estate services',     scheduleRef: 'C,E', taxType: 'expense' },
  'Professional SVC|Real Estate Tax':   { groupName: 'Legal & professional services', categoryName: 'Tax preparation',          scheduleRef: 'C,E', taxType: 'expense' },
  'Professional SVC|Register Agent':    { groupName: 'Legal & professional services', categoryName: 'Registered agent fees',    scheduleRef: 'C,E', taxType: 'expense' },

  // Utilities
  'Bills & Utilities|Electric':         { groupName: 'Utilities',              categoryName: 'Electric & gas',               scheduleRef: 'C,E', taxType: 'expense' },
  'Bills & Utilities|Gas':              { groupName: 'Utilities',              categoryName: 'Gas',                          scheduleRef: 'C,E', taxType: 'expense' },
  'Bills & Utilities|Internet':         { groupName: 'Utilities',              categoryName: 'Internet service',             scheduleRef: 'C,E', taxType: 'expense' },
  'Bills & Utilities|Mobile and Phone SVC': { groupName: 'Utilities',          categoryName: 'Telephone & mobile',           scheduleRef: 'C,E', taxType: 'expense' },
  'Bills & Utilities|Water':            { groupName: 'Utilities',              categoryName: 'Water & sewer',                scheduleRef: 'C,E', taxType: 'expense' },
  'Phone|Mobile and Phone SVC':         { groupName: 'Utilities',              categoryName: 'Telephone & mobile',           scheduleRef: 'C,E', taxType: 'expense' },

  // Auto & Travel
  'Auto & Travel|Auto/Fuel':            { groupName: 'Car & truck expenses',   categoryName: 'Gas & fuel',                   scheduleRef: 'C',   taxType: 'expense' },
  'Auto & Travel|Auto/Toll':            { groupName: 'Car & truck expenses',   categoryName: 'Parking & tolls',              scheduleRef: 'C',   taxType: 'expense' },
  'Auto & Travel|Auto/Parking':         { groupName: 'Car & truck expenses',   categoryName: 'Parking & tolls',              scheduleRef: 'C',   taxType: 'expense' },
  'Auto & Travel|Auto Lease Payment':   { groupName: 'Car & truck expenses',   categoryName: 'Lease payments',               scheduleRef: 'C',   taxType: 'expense' },
  'Auto & Travel|Auto Loan Down Payment':{ groupName: 'Car & truck expenses',  categoryName: 'Auto loan down payment',       scheduleRef: 'C',   taxType: 'expense' },
  'Auto & Travel|Travel':               { groupName: 'Travel',                 categoryName: 'Ground transportation',        scheduleRef: 'C,E', taxType: 'expense' },

  // Meals — merged from Entertainment/Food & Drink/Meal
  'Entertainment|Meal':                 { groupName: 'Meals (50% deductible)', categoryName: 'Business meals',               scheduleRef: 'C',   taxType: 'expense' },
  'Food & Drink|Meal':                  { groupName: 'Meals (50% deductible)', categoryName: 'Business meals',               scheduleRef: 'C',   taxType: 'expense' },
  'Meal|Food & Drink':                  { groupName: 'Meals (50% deductible)', categoryName: 'Business meals',               scheduleRef: 'C',   taxType: 'expense' },

  // Supplies
  'Supplies|Merchandise':               { groupName: 'Supplies',               categoryName: 'Maintenance supplies',         scheduleRef: 'C,E', taxType: 'expense' },

  // Software
  'Software|Office Expense':            { groupName: 'Other business expenses', categoryName: 'Software & SaaS subscriptions', scheduleRef: 'C', taxType: 'expense' },

  // Advertising
  'AD|AD Services':                     { groupName: 'Advertising',            categoryName: 'Online ads',                   scheduleRef: 'C,E', taxType: 'expense' },

  // Bank fees — merged Fee/Interest → Bank Fee
  'Bank Fee|Banks Charges':             { groupName: 'Other business expenses', categoryName: 'Bank & wire fees',            scheduleRef: 'C',   taxType: 'expense' },
  'Fee/Interest|Banks Charges':         { groupName: 'Other business expenses', categoryName: 'Bank & wire fees',            scheduleRef: 'C',   taxType: 'expense' },

  // Storage
  'Storage|Self Storage':               { groupName: 'Rent — vehicles & equipment', categoryName: 'Storage / warehouse',     scheduleRef: 'C',   taxType: 'expense' },

  // Postage
  'Postage|US Mail':                    { groupName: 'Office expense',         categoryName: 'Postage & shipping',           scheduleRef: 'C',   taxType: 'expense' },
  'US Mail|Postage Stamps':             { groupName: 'Office expense',         categoryName: 'Postage & shipping',           scheduleRef: 'C',   taxType: 'expense' },

  // Membership
  'Membership Fee|Membership':          { groupName: 'Other business expenses', categoryName: 'Dues & memberships',          scheduleRef: 'C',   taxType: 'expense' },

  // Non-deductible
  'Payment|Credit Card':                { groupName: 'Transfers & non-deductible', categoryName: 'Credit card payment',      scheduleRef: 'none', taxType: 'non_deductible' },
  'Payment|Credit Card Loan':           { groupName: 'Transfers & non-deductible', categoryName: 'Loan principal repayment', scheduleRef: 'none', taxType: 'non_deductible' },
  'Payment|Payment/Credit':             { groupName: 'Transfers & non-deductible', categoryName: 'Credit card payment',      scheduleRef: 'none', taxType: 'non_deductible' },
  'Bank Credit|Payment/Credit':         { groupName: 'Transfers & non-deductible', categoryName: 'Bank credit / refund',     scheduleRef: 'none', taxType: 'non_deductible' },
  'B2B Transfer|Transfer':              { groupName: 'Transfers & non-deductible', categoryName: 'Account transfer',         scheduleRef: 'none', taxType: 'non_deductible' },
}

// ── ACCOUNT MAPPING ───────────────────────────────────────────────────────────

interface AccountDef {
  institutionName: string
  accountName: string
  accountType: AccountType
}

// Maps "Account Type|Account Number" → AccountDef
const ACCOUNT_MAP: Record<string, AccountDef> = {
  'American Express Card|AMEX  X11007':         { institutionName: 'American Express', accountName: 'Amex X11007',           accountType: 'CREDIT_CARD' },
  'American Express Card|AMEX  X61008':         { institutionName: 'American Express', accountName: 'Amex X61008',           accountType: 'CREDIT_CARD' },
  'Bank of Amerca MC Credit Card|MC      X3081': { institutionName: 'Bank of America',  accountName: 'BOA MC X3081',          accountType: 'CREDIT_CARD' },
  'Bank of Amerca MC Credit Card|MC      X9807': { institutionName: 'Bank of America',  accountName: 'BOA MC X9807',          accountType: 'CREDIT_CARD' },
  'CapitalOne MasterCard  Credit|CapOn  X7327':  { institutionName: 'Capital One',       accountName: 'CapOne MC X7327',       accountType: 'CREDIT_CARD' },
  'CapitalOne Secondary Checking |CapOn   X2172': { institutionName: 'Capital One',       accountName: 'CapOne Checking X2172', accountType: 'CHECKING' },
  'Chase Cash Visa Card|Chase  X2896':           { institutionName: 'Chase',             accountName: 'Chase Visa X2896',      accountType: 'CREDIT_CARD' },
  'Chase Unlimited Visa Card|Chase  X5620':      { institutionName: 'Chase',             accountName: 'Chase Visa X5620',      accountType: 'CREDIT_CARD' },
  'CitiBank Visa Credit Card |Citi    X4640':    { institutionName: 'CitiBank',           accountName: 'Citi Visa X4640',       accountType: 'CREDIT_CARD' },
  'Discover Credit Card|Discover X 6613':        { institutionName: 'Discover',           accountName: 'Discover X6613',        accountType: 'CREDIT_CARD' },
  'Primary Business Checking|BOA   X9114':        { institutionName: 'Bank of America',  accountName: 'BOA Business X9114',    accountType: 'BUSINESS_CHECKING' },
  'Primary Business Checking|BOA   X1569':        { institutionName: 'Bank of America',  accountName: 'BOA Business X1569',    accountType: 'BUSINESS_CHECKING' },
  'Puerto Rico Business Checking|BANCO X9982':    { institutionName: 'Banco Popular',    accountName: 'Banco PR X9982',        accountType: 'BUSINESS_CHECKING' },
  'Wells Fargo Credit Card|WellsFargo X5074':     { institutionName: 'Wells Fargo',       accountName: 'WF Credit X5074',       accountType: 'CREDIT_CARD' },
  'Wells Fargo Credit Card|WellsFargo X5075':     { institutionName: 'Wells Fargo',       accountName: 'WF Credit X5075',       accountType: 'CREDIT_CARD' },
  'Wells Fargo Credit Card|WellsFargo X5076':     { institutionName: 'Wells Fargo',       accountName: 'WF Credit X5076',       accountType: 'CREDIT_CARD' },
  'Wells Fargo Credit Card|WellsFargo X5077':     { institutionName: 'Wells Fargo',       accountName: 'WF Credit X5077',       accountType: 'CREDIT_CARD' },
  'Wells Fargo Credit Card|WellsFargo X5078':     { institutionName: 'Wells Fargo',       accountName: 'WF Credit X5078',       accountType: 'CREDIT_CARD' },
  'WellsFargo Secondary Checking|WELLS   X9859':  { institutionName: 'Wells Fargo',       accountName: 'WF Checking X9859',     accountType: 'CHECKING' },
  'WellsFargo Secondary Checking|WELLS   X9858':  { institutionName: 'Wells Fargo',       accountName: 'WF Checking X9858',     accountType: 'CHECKING' },
  'WellsFargo Secondary Checking|WELLS   X9857':  { institutionName: 'Wells Fargo',       accountName: 'WF Checking X9857',     accountType: 'CHECKING' },
  'WellsFargo Secondary Checking|WELLS   X9856':  { institutionName: 'Wells Fargo',       accountName: 'WF Checking X9856',     accountType: 'CHECKING' },
  'WellsFargo Secondary Checking|WELLS   X9855':  { institutionName: 'Wells Fargo',       accountName: 'WF Checking X9855',     accountType: 'CHECKING' },
}

// ── PROPERTIES ────────────────────────────────────────────────────────────────

const PROPERTIES = [
  // Named
  'Business', 'Dos Marinas', 'Hunnicut', 'Oldfield', 'Personal',
  'Pineberry', 'Rockbluff', 'Sandy Hills', 'Talco', 'Teakwood', 'Woodoak',
  // Numeric (likely addresses/unit numbers — stored as-is)
  '5', '9', '21', '23', '24', '34', '44', '48', '61', '67', '118', '170', '177', '312',
]

// ── HELPERS ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildDuplicateHash(accountId: string, date: Date, amount: number, description: string): string {
  const raw = `${accountId}|${date.toISOString().slice(0, 10)}|${amount}|${description}`
  return createHash('sha256').update(raw).digest('hex')
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!TARGET_USER_ID) {
    console.error(
      '\n❌  GMAS_USER_ID env var is not set.\n\n' +
      '    Find the Clerk userId for gmasproperties@outlook.com at:\n' +
      '    https://dashboard.clerk.com → Users → search gmasproperties\n' +
      '    Then run:\n' +
      '    GMAS_USER_ID=user_xxxx DIRECT_URL="<neon-direct-url>" npx tsx prisma/migrate-gmas.ts\n'
    )
    process.exit(1)
  }

  const userId = TARGET_USER_ID
  console.log(`\n🚀  Migrating data for userId: ${userId}\n`)

  // ── 1. CATEGORIES ──────────────────────────────────────────────────────────
  console.log('📂  Creating category groups & categories...')

  // Collect unique groups from the map
  const groupDefs = new Map<string, { scheduleRef: string; taxType: string; categories: Set<string> }>()
  for (const def of Object.values(CATEGORY_MAP)) {
    if (!groupDefs.has(def.groupName)) {
      groupDefs.set(def.groupName, { scheduleRef: def.scheduleRef, taxType: def.taxType, categories: new Set() })
    }
    groupDefs.get(def.groupName)!.categories.add(def.categoryName)
  }

  // Create groups + categories, collect id maps
  const categoryIdByName = new Map<string, string>() // "groupName|categoryName" → categoryId

  let groupSort = 0
  for (const [groupName, { scheduleRef, taxType, categories }] of groupDefs) {
    // Upsert group (by userId + name)
    const existing = await prisma.categoryGroup.findFirst({ where: { userId, name: groupName } })
    const group = existing ?? await prisma.categoryGroup.create({
      data: { userId, name: groupName, scheduleRef, taxType, sortOrder: groupSort++ },
    })

    let catSort = 0
    for (const catName of categories) {
      const existingCat = await prisma.category.findFirst({ where: { userId, name: catName, groupId: group.id } })
      const cat = existingCat ?? await prisma.category.create({
        data: { userId, name: catName, groupId: group.id, sortOrder: catSort++ },
      })
      categoryIdByName.set(`${groupName}|${catName}`, cat.id)
    }
    console.log(`  ✓ ${groupName} (${categories.size} categories)`)
  }

  // ── 2. ACCOUNTS ───────────────────────────────────────────────────────────
  console.log('\n🏦  Creating institution schemas & accounts...')

  // Collect unique institution names
  const institutionNames = [...new Set(Object.values(ACCOUNT_MAP).map(a => a.institutionName))]
  const institutionIdByName = new Map<string, string>()

  for (const name of institutionNames) {
    const existing = await prisma.institutionSchema.findFirst({ where: { name, isGlobal: false, createdByUserId: userId } })
    const inst = existing ?? await prisma.institutionSchema.create({
      data: {
        name,
        country: name === 'Banco Popular' ? 'PR' : 'US',
        isGlobal: false,
        createdByUserId: userId,
        csvMapping: {
          dateCol: 'Date',
          amountCol: 'Amount',
          descCol: 'Description',
          dateFormat: 'MM/DD/YYYY',
          amountSign: 'normal',
        },
      },
    })
    institutionIdByName.set(name, inst.id)
  }

  // Create accounts
  const accountIdByKey = new Map<string, string>() // "AccountType|AccountNumber" → accountId

  for (const [key, def] of Object.entries(ACCOUNT_MAP)) {
    const institutionSchemaId = institutionIdByName.get(def.institutionName)!
    const existing = await prisma.account.findFirst({ where: { userId, name: def.accountName } })
    const account = existing ?? await prisma.account.create({
      data: { userId, name: def.accountName, type: def.accountType, institutionSchemaId, currency: 'USD' },
    })
    // Normalise key — trim each segment so it matches the trimmed lookup in the tx loop
    const normKey = key.split('|').map(s => s.trim()).join('|')
    accountIdByKey.set(normKey, account.id)
    console.log(`  ✓ ${def.accountName}`)
  }

  // ── 3. PROJECTS ───────────────────────────────────────────────────────────
  console.log('\n🏘️   Creating property projects...')

  const projectIdByName = new Map<string, string>()

  for (const propName of PROPERTIES) {
    const slug = slugify(propName)
    const existing = await prisma.workspace.findFirst({ where: { userId, slug } })
    const project = existing ?? await prisma.workspace.create({
      data: { userId, name: propName, slug, type: 'PROPERTY' },
    })
    projectIdByName.set(propName, project.id)
    console.log(`  ✓ ${propName}`)
  }

  // ── 4. PAYEES ─────────────────────────────────────────────────────────────
  console.log('\n👤  Creating payees...')

  const rows = JSON.parse(readFileSync(JSON_PATH, 'utf-8')) as Record<string, unknown>[]

  const NUMERIC_SUMMARY_CATS = new Set([5, 9, 21, 23, 24, 34, 44, 48, 61, 67, 118, 170, 177, 312])

  // Collect all unique non-empty payee names from valid rows
  const payeeNames = new Set<string>()
  for (const row of rows) {
    const rawCat = row['Category']
    const catAsNum = Number(rawCat)
    if (!isNaN(catAsNum) && NUMERIC_SUMMARY_CATS.has(catAsNum)) continue
    if (rawCat === null || rawCat === undefined) continue
    const payee = String(row['Payee'] ?? '').trim()
    if (payee && payee.toLowerCase() !== 'nan') payeeNames.add(payee)
  }

  // Upsert all payees and build name → id map
  const payeeIdByName = new Map<string, string>()
  for (const name of payeeNames) {
    const existing = await prisma.payee.findUnique({ where: { userId_name: { userId, name } } })
    const payee = existing ?? await prisma.payee.create({ data: { userId, name } })
    payeeIdByName.set(name, payee.id)
  }
  console.log(`  ✓ ${payeeIdByName.size} payees ready`)

  // ── 5. TRANSACTIONS ───────────────────────────────────────────────────────
  console.log('\n💸  Importing transactions...')

  // Create a single import batch per account
  const batchIdByAccount = new Map<string, string>()

  let imported = 0
  let updated = 0
  let skipped = 0
  let unmappedAccounts = new Set<string>()
  let unmappedCategories = new Set<string>()

  for (const row of rows) {
    const rawCat = row['Category']

    // Drop numeric summary rows (may come as number or numeric string from JSON)
    const catAsNum = Number(rawCat)
    if (!isNaN(catAsNum) && NUMERIC_SUMMARY_CATS.has(catAsNum)) {
      skipped++
      continue
    }
    if (rawCat === null || rawCat === undefined) {
      skipped++
      continue
    }

    // Parse date (ISO string from JSON)
    const date = new Date(String(row['Date']))
    if (isNaN(date.getTime())) {
      skipped++
      continue
    }

    // Parse amount — credit = positive, debit = negative
    const credit = Number(row['Credit']) || 0
    const debit = Number(row['Debit']) || 0
    const amount = credit !== 0 ? credit : -Math.abs(debit)

    const description = String(row['Description'] ?? '').trim()
    const category = String(rawCat).trim()
    const subCategory = String(row['Sub Category'] ?? '').trim()
    const accountType = String(row['Account Type'] ?? '').trim()
    const accountNumber = String(row['Account Number'] ?? '').trim()
    const property = String(row['Property'] ?? '').trim()
    const payeeName = String(row['Payee'] ?? '').trim()
    const payeeId = (payeeName && payeeName.toLowerCase() !== 'nan')
      ? payeeIdByName.get(payeeName)
      : undefined

    // Resolve account
    const accountKey = `${accountType}|${accountNumber}`
    let accountId = accountIdByKey.get(accountKey)
    if (!accountId) {
      unmappedAccounts.add(accountKey)
      skipped++
      continue
    }

    // Resolve category
    const catKey = `${category}|${subCategory}`
    const catDef = CATEGORY_MAP[catKey]
    let categoryId: string | undefined
    if (catDef) {
      categoryId = categoryIdByName.get(`${catDef.groupName}|${catDef.categoryName}`)
    } else {
      unmappedCategories.add(catKey)
    }

    // Resolve project
    const projectId = projectIdByName.get(property) ?? undefined

    // Dedup hash
    const duplicateHash = buildDuplicateHash(accountId, date, amount, description)

    // Get or create import batch for this account
    if (!batchIdByAccount.has(accountId)) {
      const batch = await prisma.importBatch.create({
        data: { accountId, filename: 'gmas-migration-2025.xlsx', rowCount: 0, skippedCount: 0 },
      })
      batchIdByAccount.set(accountId, batch.id)
    }
    const importBatchId = batchIdByAccount.get(accountId)!

    try {
      await prisma.transaction.create({
        data: {
          accountId,
          workspaceId: projectId ?? null,
          importBatchId,
          categoryId: categoryId ?? null,
          payeeId: payeeId ?? null,
          date,
          amount,
          description,
          category: catDef?.categoryName ?? category,
          rawData: row as object,
          duplicateHash,
        },
      })
      imported++
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        // Already imported — patch payeeId if we now have one
        if (payeeId) {
          await prisma.transaction.update({
            where: { duplicateHash },
            data: { payeeId },
          })
          updated++
        } else {
          skipped++
        }
      } else {
        throw e
      }
    }
  }

  // Update batch row counts
  for (const [accountId, batchId] of batchIdByAccount) {
    const count = await prisma.transaction.count({ where: { importBatchId: batchId } })
    await prisma.importBatch.update({ where: { id: batchId }, data: { rowCount: count } })
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log(`
✅  Migration complete!
    Imported:  ${imported} new transactions
    Updated:   ${updated} existing transactions (payee linked)
    Skipped:   ${skipped} rows (dupes without payee, summary rows, missing account)
  `)

  if (unmappedAccounts.size > 0) {
    console.log('⚠️   Unmapped accounts (transactions skipped):')
    for (const a of unmappedAccounts) console.log(`    - "${a}"`)
  }

  if (unmappedCategories.size > 0) {
    console.log('\n⚠️   Unmapped categories (transactions imported without category):')
    for (const c of unmappedCategories) console.log(`    - "${c}"`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
