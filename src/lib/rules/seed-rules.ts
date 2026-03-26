import type { ConditionDef } from './evaluate-condition'

export interface StarterRuleDef {
  id: string
  name: string
  group: 'payee' | 'category'
  tags: string[]
  payeeName: string | null
  categoryTargets: {
    personal: string | null  // category name in PERSONAL_CATEGORIES, null = not applicable
    business: string | null  // category name in ALL_CATEGORIES (Schedule C/E), null = not applicable
  }
  conditions: {
    all?: ConditionDef[]
    any?: ConditionDef[]
  }
}

/**
 * Resolve the correct categoryName for a given businessType.
 * Returns null if the rule is not applicable for this user type — caller should skip the rule.
 */
export function resolveCategoryName(
  def: StarterRuleDef,
  businessType: string
): string | null {
  if (businessType === 'personal') {
    return def.categoryTargets.personal
  }
  // For freelance, property, both — prefer business target, fall back to personal
  return def.categoryTargets.business ?? def.categoryTargets.personal
}

export const STARTER_RULES: StarterRuleDef[] = [
  // ── GROCERIES ────────────────────────────────
  {
    id: 'walmart-grocery',
    name: 'Walmart → Groceries',
    group: 'payee',
    tags: ['groceries', 'retail'],
    payeeName: 'Walmart',
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'walmart' },
      { field: 'description', operator: 'contains', value: 'wal-mart' },
    ]},
  },
  {
    id: 'kroger-grocery',
    name: 'Kroger → Groceries',
    group: 'payee',
    tags: ['groceries', 'retail'],
    payeeName: 'Kroger',
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'kroger' }] },
  },
  {
    id: 'trader-joes',
    name: "Trader Joe's → Groceries",
    group: 'payee',
    tags: ['groceries'],
    payeeName: "Trader Joe's",
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'trader joe' }] },
  },
  {
    id: 'whole-foods',
    name: 'Whole Foods → Groceries',
    group: 'payee',
    tags: ['groceries'],
    payeeName: 'Whole Foods',
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'whole foods' },
      { field: 'description', operator: 'contains', value: 'wholefds' },
    ]},
  },
  {
    id: 'costco-grocery',
    name: 'Costco → Groceries',
    group: 'payee',
    tags: ['groceries', 'retail', 'wholesale'],
    payeeName: 'Costco',
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'costco' }] },
  },
  {
    id: 'aldi-grocery',
    name: 'Aldi → Groceries',
    group: 'payee',
    tags: ['groceries'],
    payeeName: 'Aldi',
    categoryTargets: { personal: 'Groceries', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'aldi' }] },
  },

  // ── RESTAURANTS & DINING ─────────────────────
  {
    id: 'doordash-delivery',
    name: 'DoorDash → Restaurants',
    group: 'payee',
    tags: ['dining', 'delivery'],
    payeeName: 'DoorDash',
    categoryTargets: { personal: 'Restaurants & takeout', business: 'Business meals with clients' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'doordash' }] },
  },
  {
    id: 'uber-eats',
    name: 'Uber Eats → Meal delivery',
    group: 'payee',
    tags: ['dining', 'delivery'],
    payeeName: 'Uber Eats',
    categoryTargets: { personal: 'Meal delivery', business: 'Business meals with clients' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'uber eats' }] },
  },
  {
    id: 'grubhub',
    name: 'Grubhub → Meal delivery',
    group: 'payee',
    tags: ['dining', 'delivery'],
    payeeName: 'Grubhub',
    categoryTargets: { personal: 'Meal delivery', business: 'Business meals with clients' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'grubhub' }] },
  },
  {
    id: 'starbucks-coffee',
    name: 'Starbucks → Coffee',
    group: 'payee',
    tags: ['dining', 'coffee'],
    payeeName: 'Starbucks',
    categoryTargets: { personal: 'Coffee & cafes', business: 'Business meals with clients' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'starbucks' }] },
  },
  {
    id: 'mcdonalds',
    name: "McDonald's → Restaurants",
    group: 'payee',
    tags: ['dining', 'fast-food'],
    payeeName: "McDonald's",
    categoryTargets: { personal: 'Restaurants & takeout', business: 'Business meals with clients' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'mcdonald' },
      { field: 'description', operator: 'regex', value: "mcd'?s" },
    ]},
  },
  {
    id: 'chipotle',
    name: 'Chipotle → Restaurants',
    group: 'payee',
    tags: ['dining', 'fast-food'],
    payeeName: 'Chipotle',
    categoryTargets: { personal: 'Restaurants & takeout', business: 'Business meals with clients' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'chipotle' }] },
  },

  // ── TRANSPORT ────────────────────────────────
  {
    id: 'uber-rides',
    name: 'Uber → Rideshare',
    group: 'payee',
    tags: ['transport', 'rideshare'],
    payeeName: 'Uber',
    categoryTargets: { personal: 'Rideshare (Uber/Lyft)', business: 'Ground transportation' },
    conditions: { all: [
      { field: 'description', operator: 'contains', value: 'uber' },
      { field: 'description', operator: 'not_contains', value: 'uber eats' },
    ]},
  },
  {
    id: 'lyft-rides',
    name: 'Lyft → Rideshare',
    group: 'payee',
    tags: ['transport', 'rideshare'],
    payeeName: 'Lyft',
    categoryTargets: { personal: 'Rideshare (Uber/Lyft)', business: 'Ground transportation' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'lyft' }] },
  },
  {
    id: 'shell-gas',
    name: 'Shell → Fuel',
    group: 'payee',
    tags: ['transport', 'fuel'],
    payeeName: 'Shell',
    categoryTargets: { personal: 'Fuel & gas', business: 'Gas & fuel' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'shell oil' }] },
  },
  {
    id: 'chevron-gas',
    name: 'Chevron → Fuel',
    group: 'payee',
    tags: ['transport', 'fuel'],
    payeeName: 'Chevron',
    categoryTargets: { personal: 'Fuel & gas', business: 'Gas & fuel' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'chevron' }] },
  },
  {
    id: 'exxon-gas',
    name: 'ExxonMobil → Fuel',
    group: 'payee',
    tags: ['transport', 'fuel'],
    payeeName: 'ExxonMobil',
    categoryTargets: { personal: 'Fuel & gas', business: 'Gas & fuel' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'exxon' },
      { field: 'description', operator: 'contains', value: 'mobil' },
    ]},
  },

  // ── SUBSCRIPTIONS & STREAMING (personal only) ─
  {
    id: 'netflix',
    name: 'Netflix → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'Netflix',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'netflix' }] },
  },
  {
    id: 'spotify',
    name: 'Spotify → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'Spotify',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'spotify' }] },
  },
  {
    id: 'hulu',
    name: 'Hulu → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'Hulu',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'hulu' }] },
  },
  {
    id: 'disney-plus',
    name: 'Disney+ → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'Disney+',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'disney plus' },
      { field: 'description', operator: 'contains', value: 'disney+' },
      { field: 'description', operator: 'contains', value: 'disneyplus' },
    ]},
  },
  {
    id: 'youtube-premium',
    name: 'YouTube Premium → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'YouTube Premium',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'youtube premium' },
      { field: 'description', operator: 'contains', value: 'youtube.com' },
    ]},
  },
  {
    id: 'apple-music',
    name: 'Apple Music → Streaming',
    group: 'payee',
    tags: ['subscription', 'streaming'],
    payeeName: 'Apple Music',
    categoryTargets: { personal: 'Streaming services', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'apple music' }] },
  },

  // ── SOFTWARE & SAAS (both taxonomies) ────────
  {
    id: 'adobe-software',
    name: 'Adobe → Software',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Adobe',
    categoryTargets: { personal: 'Software & apps', business: 'Software & SaaS subscriptions' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'adobe' }] },
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365 → Software',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Microsoft',
    categoryTargets: { personal: 'Software & apps', business: 'Software & SaaS subscriptions' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'microsoft 365' },
      { field: 'description', operator: 'contains', value: 'msft' },
    ]},
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace → Software',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Google',
    categoryTargets: { personal: 'Software & apps', business: 'Software & SaaS subscriptions' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'google workspace' },
      { field: 'description', operator: 'contains', value: 'google*storage' },
    ]},
  },
  {
    id: 'dropbox',
    name: 'Dropbox → Cloud storage',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Dropbox',
    categoryTargets: { personal: 'Cloud storage', business: 'Software & SaaS subscriptions' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'dropbox' }] },
  },
  {
    id: 'slack',
    name: 'Slack → Software',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Slack',
    categoryTargets: { personal: 'Software & apps', business: 'Software & SaaS subscriptions' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'slack' }] },
  },
  {
    id: 'zoom',
    name: 'Zoom → Software',
    group: 'payee',
    tags: ['subscription', 'software'],
    payeeName: 'Zoom',
    categoryTargets: { personal: 'Software & apps', business: 'Software & SaaS subscriptions' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'zoom.us' },
      { field: 'description', operator: 'contains', value: 'zoom video' },
    ]},
  },

  // ── SHOPPING / RETAIL ────────────────────────
  {
    id: 'amazon-shopping',
    name: 'Amazon → Shopping',
    group: 'payee',
    tags: ['shopping', 'online'],
    payeeName: 'Amazon',
    categoryTargets: { personal: 'Electronics & tech', business: 'Raw materials' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'amazon' },
      { field: 'description', operator: 'contains', value: 'amzn' },
    ]},
  },
  {
    id: 'target-retail',
    name: 'Target → Household',
    group: 'payee',
    tags: ['shopping', 'retail'],
    payeeName: 'Target',
    categoryTargets: { personal: 'Household goods', business: 'Cleaning supplies' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'target' }] },
  },
  {
    id: 'apple-store',
    name: 'Apple Store → Tech',
    group: 'payee',
    tags: ['shopping', 'tech'],
    payeeName: 'Apple',
    categoryTargets: { personal: 'Electronics & tech', business: 'Computer & electronics' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'apple.com' },
      { field: 'description', operator: 'contains', value: 'apple store' },
    ]},
  },
  {
    id: 'ikea',
    name: 'IKEA → Furniture',
    group: 'payee',
    tags: ['shopping', 'home'],
    payeeName: 'IKEA',
    categoryTargets: { personal: 'Furniture & decor', business: 'Furniture & fixtures' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'ikea' }] },
  },
  {
    id: 'home-depot',
    name: 'Home Depot → Repairs',
    group: 'payee',
    tags: ['shopping', 'home', 'hardware'],
    payeeName: 'Home Depot',
    categoryTargets: { personal: 'Repairs & maintenance', business: 'Building / facility repairs' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'home depot' },
      { field: 'description', operator: 'contains', value: 'homedepot' },
    ]},
  },
  {
    id: 'lowes',
    name: "Lowe's → Repairs",
    group: 'payee',
    tags: ['shopping', 'home', 'hardware'],
    payeeName: "Lowe's",
    categoryTargets: { personal: 'Repairs & maintenance', business: 'Building / facility repairs' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: "lowe's" },
      { field: 'description', operator: 'contains', value: 'lowes' },
    ]},
  },

  // ── UTILITIES ────────────────────────────────
  {
    id: 'att-phone',
    name: 'AT&T → Phone',
    group: 'payee',
    tags: ['utilities', 'phone'],
    payeeName: 'AT&T',
    categoryTargets: { personal: 'Internet & cable', business: 'Telephone & mobile' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'at&t' },
      { field: 'description', operator: 'contains', value: 'att*' },
    ]},
  },
  {
    id: 'verizon-phone',
    name: 'Verizon → Phone',
    group: 'payee',
    tags: ['utilities', 'phone'],
    payeeName: 'Verizon',
    categoryTargets: { personal: 'Internet & cable', business: 'Telephone & mobile' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'verizon' }] },
  },
  {
    id: 't-mobile-phone',
    name: 'T-Mobile → Phone',
    group: 'payee',
    tags: ['utilities', 'phone'],
    payeeName: 'T-Mobile',
    categoryTargets: { personal: 'Internet & cable', business: 'Telephone & mobile' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 't-mobile' },
      { field: 'description', operator: 'contains', value: 'tmobile' },
    ]},
  },
  {
    id: 'comcast-internet',
    name: 'Comcast/Xfinity → Internet',
    group: 'payee',
    tags: ['utilities', 'internet'],
    payeeName: 'Comcast',
    categoryTargets: { personal: 'Internet & cable', business: 'Internet service' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'comcast' },
      { field: 'description', operator: 'contains', value: 'xfinity' },
    ]},
  },

  // ── INSURANCE ────────────────────────────────
  {
    id: 'geico-insurance',
    name: 'GEICO → Car insurance',
    group: 'payee',
    tags: ['insurance', 'auto'],
    payeeName: 'GEICO',
    categoryTargets: { personal: 'Car insurance', business: 'Insurance (vehicle)' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'geico' }] },
  },
  {
    id: 'state-farm',
    name: 'State Farm → Insurance',
    group: 'payee',
    tags: ['insurance'],
    payeeName: 'State Farm',
    categoryTargets: { personal: 'Car insurance', business: 'General liability' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'state farm' }] },
  },

  // ── HEALTH (personal only) ───────────────────
  {
    id: 'cvs-pharmacy',
    name: 'CVS → Pharmacy',
    group: 'payee',
    tags: ['health', 'pharmacy'],
    payeeName: 'CVS',
    categoryTargets: { personal: 'Prescriptions', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'cvs' }] },
  },
  {
    id: 'walgreens-pharmacy',
    name: 'Walgreens → Pharmacy',
    group: 'payee',
    tags: ['health', 'pharmacy'],
    payeeName: 'Walgreens',
    categoryTargets: { personal: 'Prescriptions', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'walgreens' }] },
  },
  {
    id: 'planet-fitness',
    name: 'Planet Fitness → Gym',
    group: 'payee',
    tags: ['health', 'fitness'],
    payeeName: 'Planet Fitness',
    categoryTargets: { personal: 'Gym & fitness', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'planet fitness' }] },
  },
  {
    id: 'peloton',
    name: 'Peloton → Gym',
    group: 'payee',
    tags: ['health', 'fitness', 'subscription'],
    payeeName: 'Peloton',
    categoryTargets: { personal: 'Gym & fitness', business: null },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'peloton' }] },
  },

  // ── TRAVEL ───────────────────────────────────
  {
    id: 'airbnb',
    name: 'Airbnb → Lodging',
    group: 'payee',
    tags: ['travel', 'lodging'],
    payeeName: 'Airbnb',
    categoryTargets: { personal: 'Hotels & accommodation', business: 'Lodging' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'airbnb' }] },
  },
  {
    id: 'united-airlines',
    name: 'United Airlines → Flights',
    group: 'payee',
    tags: ['travel', 'airline'],
    payeeName: 'United Airlines',
    categoryTargets: { personal: 'Flights', business: 'Airfare' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'united air' },
      { field: 'description', operator: 'contains', value: 'united airlines' },
    ]},
  },
  {
    id: 'delta-airlines',
    name: 'Delta Airlines → Flights',
    group: 'payee',
    tags: ['travel', 'airline'],
    payeeName: 'Delta Airlines',
    categoryTargets: { personal: 'Flights', business: 'Airfare' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'delta air' },
      { field: 'description', operator: 'contains', value: 'delta airlines' },
    ]},
  },
  {
    id: 'southwest-airlines',
    name: 'Southwest Airlines → Flights',
    group: 'payee',
    tags: ['travel', 'airline'],
    payeeName: 'Southwest Airlines',
    categoryTargets: { personal: 'Flights', business: 'Airfare' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'southwest' }] },
  },

  // ── PAYMENTS & TRANSFERS ─────────────────────
  {
    id: 'venmo-transfer',
    name: 'Venmo → Transfer',
    group: 'payee',
    tags: ['transfer', 'p2p'],
    payeeName: 'Venmo',
    categoryTargets: { personal: 'Account transfer', business: 'Account transfer' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'venmo' }] },
  },
  {
    id: 'zelle-transfer',
    name: 'Zelle → Transfer',
    group: 'payee',
    tags: ['transfer', 'p2p'],
    payeeName: 'Zelle',
    categoryTargets: { personal: 'Account transfer', business: 'Account transfer' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'zelle' }] },
  },
  {
    id: 'paypal-transfer',
    name: 'PayPal → Transfer',
    group: 'payee',
    tags: ['transfer', 'p2p'],
    payeeName: 'PayPal',
    categoryTargets: { personal: 'Account transfer', business: 'Account transfer' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'paypal' }] },
  },

  // ── BUSINESS-ONLY ────────────────────────────
  {
    id: 'stripe-processing',
    name: 'Stripe → Processing fees',
    group: 'payee',
    tags: ['fees', 'processing', 'business'],
    payeeName: 'Stripe',
    categoryTargets: { personal: null, business: 'Payment processing fees' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'stripe' }] },
  },
  {
    id: 'square-processing',
    name: 'Square → Processing fees',
    group: 'payee',
    tags: ['fees', 'processing', 'business'],
    payeeName: 'Square',
    categoryTargets: { personal: null, business: 'Payment processing fees' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'square' },
      { field: 'description', operator: 'contains', value: 'sq *' },
    ]},
  },
  {
    id: 'wework-rent',
    name: 'WeWork → Coworking',
    group: 'payee',
    tags: ['office', 'coworking', 'business'],
    payeeName: 'WeWork',
    categoryTargets: { personal: null, business: 'Coworking membership' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'wework' }] },
  },

  // ── EDUCATION ────────────────────────────────
  {
    id: 'udemy',
    name: 'Udemy → Courses',
    group: 'payee',
    tags: ['education', 'courses'],
    payeeName: 'Udemy',
    categoryTargets: { personal: 'Online courses', business: 'Education & training' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'udemy' }] },
  },
  {
    id: 'coursera',
    name: 'Coursera → Courses',
    group: 'payee',
    tags: ['education', 'courses'],
    payeeName: 'Coursera',
    categoryTargets: { personal: 'Online courses', business: 'Education & training' },
    conditions: { all: [{ field: 'description', operator: 'contains', value: 'coursera' }] },
  },

  // ── CATEGORY-LEVEL RULES ─────────────────────
  {
    id: 'atm-withdrawal',
    name: 'ATM → Cash withdrawal',
    group: 'category',
    tags: ['cash', 'atm'],
    payeeName: null,
    categoryTargets: { personal: 'Cash withdrawal', business: "Owner's draw / distribution" },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'atm withdrawal' },
      { field: 'description', operator: 'contains', value: 'atm w/d' },
      { field: 'description', operator: 'contains', value: 'cash withdrawal' },
    ]},
  },
  {
    id: 'interest-earned',
    name: 'Interest earned → Income',
    group: 'category',
    tags: ['income', 'interest'],
    payeeName: null,
    categoryTargets: { personal: 'Investment income', business: 'Interest income' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'interest earned' },
      { field: 'description', operator: 'contains', value: 'interest payment' },
      { field: 'description', operator: 'contains', value: 'interest credit' },
    ]},
  },
  {
    id: 'direct-deposit-income',
    name: 'Direct deposit → Salary',
    group: 'category',
    tags: ['income', 'salary'],
    payeeName: null,
    categoryTargets: { personal: 'Salary & wages', business: 'Service revenue' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'direct dep' },
      { field: 'description', operator: 'contains', value: 'payroll' },
      { field: 'description', operator: 'contains', value: 'direct deposit' },
    ]},
  },
  {
    id: 'overdraft-fee',
    name: 'Overdraft fee → Bank fees',
    group: 'category',
    tags: ['fees', 'bank'],
    payeeName: null,
    categoryTargets: { personal: null, business: 'Bank & wire fees' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'overdraft' },
      { field: 'description', operator: 'contains', value: 'nsf fee' },
      { field: 'description', operator: 'contains', value: 'insufficient funds' },
    ]},
  },
  {
    id: 'wire-transfer-fee',
    name: 'Wire fee → Bank fees',
    group: 'category',
    tags: ['fees', 'bank'],
    payeeName: null,
    categoryTargets: { personal: null, business: 'Bank & wire fees' },
    conditions: { any: [
      { field: 'description', operator: 'contains', value: 'wire fee' },
      { field: 'description', operator: 'contains', value: 'wire transfer fee' },
      { field: 'description', operator: 'contains', value: 'service charge' },
    ]},
  },
]
