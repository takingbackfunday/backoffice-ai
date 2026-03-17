import type { Rule } from './engine'
import type { TransactionFact, CategorizationResult } from './categorization'
import { allOf, anyOf, containsAny, isExpense, isIncome } from './conditions'

export const systemCategorizationRules: Rule<TransactionFact, CategorizationResult>[] = [
  // ── priority 5: Transfers — must be detected before income/expense rules ──
  {
    id: 'sys-transfer',
    name: 'Account transfers',
    priority: 5,
    condition: anyOf(
      containsAny((f) => f.description, [
        'transfer to', 'transfer from', 'own account', 'internal transfer',
        'umbuchung', 'eigene überweisung',
      ])
    ),
    action: () => ({
      categoryName: 'Account Transfer',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-transfer',
    }),
  },

  // ── priority 10: Bank fees ──
  {
    id: 'sys-bank-fees',
    name: 'Bank fees & charges',
    priority: 10,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'bank fee', 'service charge', 'overdraft', 'atm fee',
        'monthly fee', 'wire fee', 'foreign transaction fee',
        'kontoführung', 'account maintenance', 'annual fee',
      ])
    ),
    action: () => ({
      categoryName: 'Bank Fees',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-bank-fees',
    }),
  },

  // ── priority 10: Interest income ──
  {
    id: 'sys-interest',
    name: 'Interest income',
    priority: 10,
    condition: allOf(
      isIncome,
      containsAny((f) => f.description, [
        'interest', 'zinsen', 'interest earned', 'interest credit',
      ])
    ),
    action: () => ({
      categoryName: 'Interest',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-interest',
    }),
  },

  // ── priority 20: Software & SaaS ──
  {
    id: 'sys-software',
    name: 'Software & SaaS subscriptions',
    priority: 20,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'github', 'notion', 'figma', 'slack', 'zoom', 'dropbox',
        'adobe', 'google workspace', 'microsoft 365', 'office 365',
        'aws', 'amazon web services', 'heroku', 'vercel', 'netlify',
        'digitalocean', 'openai', 'anthropic', 'linear', 'jira',
        'atlassian', 'canva', 'grammarly', '1password', 'cloudflare',
        'fastmail', 'loom', 'typeform', 'airtable', 'zapier',
      ])
    ),
    action: () => ({
      categoryName: 'Software & Subscriptions',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-software',
    }),
  },

  // ── priority 30: Travel ──
  {
    id: 'sys-travel',
    name: 'Travel expenses',
    priority: 30,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'airline', 'airways', 'ryanair', 'easyjet', 'lufthansa',
        'british airways', 'delta', 'united air', 'american air',
        'booking.com', 'airbnb', 'expedia', 'hotels.com',
        'hotel', 'marriott', 'hilton', 'ibis', 'premier inn',
        'uber', 'lyft', 'bolt', 'taxi', 'cab',
        'train', 'amtrak', 'eurostar', 'deutsche bahn', 'national rail',
        'tfl', 'transit', 'subway', 'metro',
      ])
    ),
    action: () => ({
      categoryName: 'Travel',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-travel',
    }),
  },

  // ── priority 40: Meals & Entertainment ──
  {
    id: 'sys-meals',
    name: 'Meals & dining',
    priority: 40,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'restaurant', 'cafe', 'coffee', 'starbucks', 'costa coffee',
        'mcdonald', 'burger king', 'subway', 'kfc', 'nando',
        'deliveroo', 'uber eats', 'doordash', 'grubhub', 'just eat',
        'lieferando', 'pizza', 'sushi', 'wagamama',
      ])
    ),
    action: () => ({
      categoryName: 'Meals & Entertainment',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'medium', // could be personal — flag for review
      ruleId: 'sys-meals',
    }),
  },

  // ── priority 50: Office & Equipment ──
  {
    id: 'sys-office',
    name: 'Office supplies & equipment',
    priority: 50,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'staples', 'office depot', 'officeworks', 'ryman',
        'apple store', 'apple.com/bill', 'media markt', 'currys',
        'best buy', 'dell', 'lenovo',
      ])
    ),
    action: () => ({
      categoryName: 'Office Supplies',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'medium',
      ruleId: 'sys-office',
    }),
  },

  // ── priority 55: Professional Services ──
  {
    id: 'sys-professional',
    name: 'Professional services',
    priority: 55,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'accountant', 'solicitor', 'lawyer', 'legal', 'notary',
        'consultant', 'freelancer', 'contractor',
      ])
    ),
    action: () => ({
      categoryName: 'Professional Services',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'medium',
      ruleId: 'sys-professional',
    }),
  },

  // ── priority 60: Utilities & Rent ──
  {
    id: 'sys-utilities',
    name: 'Utilities & rent',
    priority: 60,
    condition: allOf(
      isExpense,
      containsAny((f) => f.description, [
        'electric', 'electricity', 'gas bill', 'water bill',
        'internet', 'broadband', 'bt group', 'virgin media',
        'comcast', 'at&t', 'verizon', 'tmobile',
        'rent', 'lease', 'miete',
      ])
    ),
    action: () => ({
      categoryName: 'Rent & Utilities',
      categoryId: null,
      payeeId: null,
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-utilities',
    }),
  },
]
