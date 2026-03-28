import type { PrismaClient } from '../../prisma/generated/prisma'

export type BusinessType = 'freelance' | 'property' | 'both' | 'personal'

interface GroupDef {
  group: string
  scheduleRef: string    // "C" | "E" | "C,E" | "none"
  taxType: string        // "income" | "expense" | "non_deductible"
  categories: string[]
}

const ALL_CATEGORIES: GroupDef[] = [
  // ── INCOME ──────────────────────────────────────────────────────
  {
    group: 'Gross receipts / sales',
    scheduleRef: 'C',
    taxType: 'income',
    categories: [
      'Service revenue',
      'Product sales',
      'Commissions earned',
      'Refunds & returns (contra)',
    ],
  },
  {
    group: 'Other business income',
    scheduleRef: 'C',
    taxType: 'income',
    categories: [
      'Interest income',
      'Dividend income',
      'Royalties',
      'Miscellaneous income',
    ],
  },
  {
    group: 'Rental income',
    scheduleRef: 'E',
    taxType: 'income',
    categories: [
      'Rents received',
      'Late fees collected',
      'Security deposit forfeited',
      'Laundry / vending income',
    ],
  },

  // ── SHARED EXPENSES (both C and E) ─────────────────────────────
  {
    group: 'Advertising',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Online ads (Google, Meta, LinkedIn)',
      'Print & direct mail',
      'Signage & displays',
      'Listing sites & vacancy ads',
      'Website & SEO',
    ],
  },
  {
    group: 'Insurance',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'General liability',
      'Professional liability / E&O',
      'Property insurance',
      'Workers\' compensation',
      'Business interruption',
      'Landlord / rental dwelling policy',
      'Flood / earthquake',
    ],
  },
  {
    group: 'Legal & professional services',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Accounting & bookkeeping',
      'Legal fees',
      'Tax preparation',
      'Consulting fees',
      'Payroll service fees',
      'Eviction / collections legal',
    ],
  },
  {
    group: 'Repairs & maintenance',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Building / facility repairs',
      'Plumbing',
      'Electrical',
      'HVAC',
      'Appliance repair',
      'Equipment maintenance',
      'IT support & repairs',
      'Painting & cosmetic',
    ],
  },
  {
    group: 'Supplies',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Raw materials',
      'Packaging & shipping materials',
      'Tools & small equipment',
      'Safety supplies',
      'Cleaning supplies',
      'Maintenance supplies',
    ],
  },
  {
    group: 'Taxes & licenses',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'State & local business taxes',
      'Business licenses & permits',
      'Payroll taxes (employer share)',
      'Property tax',
      'Franchise tax',
    ],
  },
  {
    group: 'Travel',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Airfare',
      'Lodging',
      'Ground transportation',
      'Car rental',
      'Conference registration',
      'Per diem / incidentals',
      'Mileage (property visits)',
    ],
  },
  {
    group: 'Utilities',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Electric & gas',
      'Water & sewer',
      'Telephone & mobile',
      'Internet service',
      'Trash / recycling',
    ],
  },
  {
    group: 'Depreciation & Section 179',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Computer & electronics',
      'Furniture & fixtures',
      'Machinery & equipment',
      'Leasehold improvements',
      'Vehicles (depreciation portion)',
      'Residential rental property (27.5 yr)',
      'Appliances & fixtures (rental)',
    ],
  },
  {
    group: 'Interest',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Business loan interest',
      'Line of credit interest',
      'Credit card interest (business)',
      'Mortgage interest (business property)',
      'Mortgage interest (rental property)',
    ],
  },
  {
    group: 'Office expense',
    scheduleRef: 'C,E',
    taxType: 'expense',
    categories: [
      'Office supplies & stationery',
      'Postage & shipping',
      'Printing & copying',
      'Small equipment (< $2,500)',
      'Cleaning & janitorial',
    ],
  },

  // ── SCHEDULE C ONLY (freelance / sole proprietor) ──────────────
  {
    group: 'Car & truck expenses',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Gas & fuel',
      'Parking & tolls',
      'Repairs & maintenance (vehicle)',
      'Insurance (vehicle)',
      'Lease payments (vehicle)',
      'Mileage (standard rate)',
    ],
  },
  {
    group: 'Commissions & fees',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Sales commissions paid',
      'Platform / marketplace fees',
      'Referral fees',
      'Payment processing fees',
    ],
  },
  {
    group: 'Contract labor',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Freelancers / 1099 contractors',
      'Subcontractors',
      'Temp agency workers',
    ],
  },
  {
    group: 'Employee benefit programs',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Health insurance (employees)',
      'Retirement plan contributions',
      'Education & tuition assistance',
      'Other fringe benefits',
    ],
  },
  {
    group: 'Pension & profit-sharing plans',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'SEP-IRA contributions',
      'SIMPLE IRA contributions',
      'Solo 401(k) contributions',
    ],
  },
  {
    group: 'Rent — vehicles & equipment',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Equipment rental',
      'Vehicle lease payments',
    ],
  },
  {
    group: 'Rent — business property',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Office / workspace rent',
      'Coworking membership',
      'Storage / warehouse',
    ],
  },
  {
    group: 'Meals (50% deductible)',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Business meals with clients',
      'Business meals while traveling',
      'Team / employee meals',
    ],
  },
  {
    group: 'Wages',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Salaries & wages',
      'Bonuses',
      'Commissions (to employees)',
      'Overtime',
    ],
  },
  {
    group: 'Business use of home',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Home office (simplified method)',
      'Home office (actual expenses)',
    ],
  },
  {
    group: 'Other business expenses',
    scheduleRef: 'C',
    taxType: 'expense',
    categories: [
      'Software & SaaS subscriptions',
      'Bank & wire fees',
      'Education & training',
      'Dues & memberships',
      'Charitable contributions (business)',
      'Bad debts',
    ],
  },

  // ── SCHEDULE E ONLY (rental property) ──────────────────────────
  {
    group: 'Cleaning & maintenance',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'Turnover cleaning',
      'Regular cleaning service',
      'Pest control',
      'Snow removal',
      'Carpet / floor cleaning',
    ],
  },
  {
    group: 'Management fees',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'Property management company',
      'Leasing agent fees',
      'On-site manager wages',
    ],
  },
  {
    group: 'HOA & condo fees',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'HOA dues',
      'Condo association fees',
      'Special assessments',
    ],
  },
  {
    group: 'Tenant-related expenses',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'Tenant screening & background checks',
      'Lease preparation',
      'Relocation / cash-for-keys',
      'Tenant improvements',
    ],
  },
  {
    group: 'Landscaping & grounds',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'Lawn care & mowing',
      'Tree trimming',
      'Irrigation & sprinklers',
      'Common area maintenance',
    ],
  },
  {
    group: 'Other rental expenses',
    scheduleRef: 'E',
    taxType: 'expense',
    categories: [
      'Lock & key replacement',
      'Smoke / CO detector compliance',
      'Bank & wire fees (rental)',
      'Mileage (property visits)',
      'Software (property management)',
    ],
  },

  // ── NON-DEDUCTIBLE (always included) ───────────────────────────
  {
    group: 'Transfers & non-deductible',
    scheduleRef: 'none',
    taxType: 'non_deductible',
    categories: [
      'Account transfer',
      'Credit card payment',
      'Owner\'s draw / distribution',
      'Personal expenses (non-deductible)',
      'Loan principal repayment',
      'Security deposit held',
      'Security deposit returned',
    ],
  },
]

// ── PERSONAL FINANCE taxonomy (entirely separate from Schedule C/E) ──────────
const PERSONAL_CATEGORIES: GroupDef[] = [
  {
    group: 'Income',
    scheduleRef: 'none',
    taxType: 'income',
    categories: [
      'Salary & wages',
      'Freelance / side income',
      'Rental income',
      'Investment income',
      'Government benefits',
      'Gifts received',
      'Other income',
    ],
  },
  {
    group: 'Housing',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Rent / mortgage',
      'Electric & gas',
      'Water & sewer',
      'Internet & cable',
      'Home insurance',
      'Repairs & maintenance',
      'Furniture & decor',
      'Cleaning services',
    ],
  },
  {
    group: 'Food & dining',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Groceries',
      'Restaurants & takeout',
      'Coffee & cafes',
      'Alcohol & bars',
      'Meal delivery',
    ],
  },
  {
    group: 'Transport',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Car payment / lease',
      'Fuel & gas',
      'Car insurance',
      'Parking & tolls',
      'Public transit',
      'Rideshare (Uber/Lyft)',
      'Car repairs & maintenance',
    ],
  },
  {
    group: 'Health',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Health insurance',
      'Doctor & specialist',
      'Dental & vision',
      'Prescriptions',
      'Therapy & mental health',
      'Gym & fitness',
    ],
  },
  {
    group: 'Shopping',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Clothing & shoes',
      'Electronics & tech',
      'Household goods',
      'Books & stationery',
      'Gifts given',
    ],
  },
  {
    group: 'Entertainment',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Streaming services',
      'Movies & concerts',
      'Hobbies & sports',
      'Games',
      'Events & experiences',
    ],
  },
  {
    group: 'Travel',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Flights',
      'Hotels & accommodation',
      'Car rental',
      'Activities & tours',
      'Travel insurance',
    ],
  },
  {
    group: 'Education',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Tuition & fees',
      'Student loan payments',
      'Books & supplies',
      'Online courses',
      'Childcare & school',
    ],
  },
  {
    group: 'Personal care',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Haircuts & salon',
      'Toiletries & cosmetics',
      'Spa & wellness',
      'Clothing care (dry cleaning)',
    ],
  },
  {
    group: 'Family & pets',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Childcare',
      'Kids\' activities',
      'Pet food & supplies',
      'Vet & pet insurance',
      'Elder care',
    ],
  },
  {
    group: 'Subscriptions',
    scheduleRef: 'none',
    taxType: 'expense',
    categories: [
      'Software & apps',
      'Memberships & clubs',
      'News & media',
      'Cloud storage',
    ],
  },
  {
    group: 'Savings & investments',
    scheduleRef: 'none',
    taxType: 'non_deductible',
    categories: [
      'Emergency fund',
      '401(k) / IRA contribution',
      'Brokerage / stocks',
      'Crypto',
      'Other savings',
    ],
  },
  {
    group: 'Debt payments',
    scheduleRef: 'none',
    taxType: 'non_deductible',
    categories: [
      'Credit card payment',
      'Student loan payment',
      'Car loan payment',
      'Personal loan payment',
    ],
  },
  {
    group: 'Transfers & other',
    scheduleRef: 'none',
    taxType: 'non_deductible',
    categories: [
      'Account transfer',
      'Cash withdrawal',
      'Uncategorized',
    ],
  },
]

/**
 * Filter the master category list based on business type.
 * 'freelance' → C + C,E + none
 * 'property'  → E + C,E + none
 * 'both'      → everything
 * 'personal'  → PERSONAL_CATEGORIES (entirely separate list)
 */
function getGroupsForType(type: BusinessType): GroupDef[] {
  if (type === 'personal') return PERSONAL_CATEGORIES
  return ALL_CATEGORIES.filter((g) => {
    if (g.scheduleRef === 'none' || g.scheduleRef === 'C,E') return true
    if (type === 'both') return true
    if (type === 'freelance' && g.scheduleRef === 'C') return true
    if (type === 'property' && g.scheduleRef === 'E') return true
    return false
  })
}

export async function seedDefaultCategories(
  userId: string,
  db: PrismaClient,
  businessType: BusinessType = 'both'
) {
  const groups = getGroupsForType(businessType)

  // Build all records up front
  const groupRows = groups.map((g, gi) => ({
    id: `default-${userId}-${g.group.toLowerCase().replace(/[\s/&'(),<>]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')}`,
    userId,
    name: g.group,
    sortOrder: gi,
    scheduleRef: g.scheduleRef,
    taxType: g.taxType,
  }))

  const categoryRows = groups.flatMap((g, gi) => {
    const groupId = groupRows[gi].id
    return g.categories.map((catName, ci) => ({
      id: `default-${userId}-${groupId.replace(`default-${userId}-`, '')}-${catName.toLowerCase().replace(/[\s/&'(),<>]+/g, '-').replace(/-+/g, '-').replace(/-$/, '')}`,
      userId,
      name: catName,
      groupId,
      sortOrder: ci,
    }))
  })

  // Delete existing defaults for this user, then bulk insert — 3 queries total
  await db.categoryGroup.deleteMany({
    where: { userId, id: { startsWith: `default-${userId}-` } },
  })
  await db.categoryGroup.createMany({ data: groupRows })
  await db.category.createMany({ data: categoryRows })
}

/** Re-export the list for the onboarding UI to show counts */
export function getCategoryCounts() {
  const freelanceGroups = ALL_CATEGORIES.filter(
    (g) => g.scheduleRef === 'C' || g.scheduleRef === 'C,E' || g.scheduleRef === 'none'
  )
  const propertyGroups = ALL_CATEGORIES.filter(
    (g) => g.scheduleRef === 'E' || g.scheduleRef === 'C,E' || g.scheduleRef === 'none'
  )
  return {
    freelance: {
      groups: freelanceGroups.length,
      categories: freelanceGroups.reduce((s, g) => s + g.categories.length, 0),
    },
    property: {
      groups: propertyGroups.length,
      categories: propertyGroups.reduce((s, g) => s + g.categories.length, 0),
    },
    both: {
      groups: ALL_CATEGORIES.length,
      categories: ALL_CATEGORIES.reduce((s, g) => s + g.categories.length, 0),
    },
    personal: {
      groups: PERSONAL_CATEGORIES.length,
      categories: PERSONAL_CATEGORIES.reduce((s, g) => s + g.categories.length, 0),
    },
  }
}
