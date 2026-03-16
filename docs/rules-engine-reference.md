# Backoffice AI — Rules Engine Reference

> **Purpose:** Offline reference for implementing a rules engine in Backoffice AI.
> Focused on the three places rules matter in this app: **auto-categorizing imported transactions**,
> **auto-mapping CSV columns**, and **validating imports**. All code examples use the actual stack
> (Next.js 14, Prisma, TypeScript, Zod, PostgreSQL on Neon).
>
> **Read `HANDOFF.md` first** for current project state.
> **Read `accounting-reference.md`** for the data model and domain context.

---

## 1. Where Rules Fit in Backoffice AI

Backoffice AI is a transaction import/tagging tool, not a full accounting system. The rules engine needs are correspondingly simpler than an ERP — but still worth doing properly because they touch the core user experience.

### Three Rule Subsystems

| Subsystem | Trigger | Strategy | Purpose |
|---|---|---|---|
| **Transaction categorization** | After CSV import, before commit | First-match | Auto-assign a category (and optionally a project) to each imported transaction |
| **Column mapping** | When CSV headers are detected | Ranked match | Auto-map CSV column names to standard fields (date, amount, description, merchant) |
| **Import validation** | Before committing an import batch | All-match | Catch problems: missing required fields, unparseable dates, duplicate rows, zero amounts |

The column mapper already exists (`guessMapping()` in `column-mapper.tsx`). The other two need to be built. This doc covers all three with implementation patterns.

---

## 2. The Core Pattern

Every rule system in the app follows the same shape:

```typescript
// src/lib/rules/engine.ts

export interface Rule<TFact, TResult> {
  id: string;
  name: string;
  priority: number;                          // lower number = evaluated first
  condition: (fact: TFact) => boolean;
  action: (fact: TFact) => TResult;
}

export type EvalStrategy = 'first' | 'all';

export function evaluateRules<TFact, TResult>(
  fact: TFact,
  rules: Rule<TFact, TResult>[],
  strategy: EvalStrategy = 'first'
): TResult[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const results: TResult[] = [];

  for (const rule of sorted) {
    if (rule.condition(fact)) {
      results.push(rule.action(fact));
      if (strategy === 'first') break;
    }
  }

  return results;
}
```

That's the entire engine — ~20 lines. The complexity lives in the rules themselves, not the engine.

---

## 3. Transaction Auto-Categorization

This is the highest-value rules feature. When a user imports a CSV, the system should pre-fill category (and optionally project) for as many transactions as possible, so the user only has to review and correct rather than tag from scratch.

### 3.1 The Fact (What Gets Evaluated)

This maps directly to what `csv-processor.ts` produces — a normalized `PreviewRow`:

```typescript
// src/lib/rules/categorization.ts

export interface TransactionFact {
  description: string;
  merchantName: string | null;
  amount: number;                    // signed: negative = expense, positive = income
  currency: string;                  // "USD", "GBP", "EUR"
  date: Date;
  accountId: string;                 // which Account this came from
  // Enrichments from the InstitutionSchema or raw CSV:
  rawDescription: string;            // original unmodified description
  bankName: string | null;           // e.g. "Chase Credit Card", "N26"
}
```

### 3.2 The Result

```typescript
export interface CategorizationResult {
  categorySlug: string;              // matches Category.slug when taxonomy is added
  categoryName: string;              // human-readable, for display in preview
  projectId: string | null;          // optional: auto-assign to a project
  confidence: 'high' | 'medium';    // high = auto-apply, medium = suggest to user
  ruleId: string;                    // which rule matched (for debugging/auditing)
}
```

### 3.3 Condition Building Blocks

Rules need to match against text fields (description, merchant) and numeric fields (amount). Here's the condition toolkit:

```typescript
// src/lib/rules/conditions.ts

export type FieldAccessor<T> = (fact: T) => string | number | null | undefined;

export function containsAny(
  accessor: FieldAccessor<TransactionFact>,
  keywords: string[]
): (fact: TransactionFact) => boolean {
  return (fact) => {
    const value = String(accessor(fact) ?? '').toLowerCase();
    return keywords.some(kw => value.includes(kw.toLowerCase()));
  };
}

export function matchesRegex(
  accessor: FieldAccessor<TransactionFact>,
  pattern: RegExp
): (fact: TransactionFact) => boolean {
  return (fact) => {
    const value = String(accessor(fact) ?? '');
    return pattern.test(value);
  };
}

export function amountBetween(
  min: number,
  max: number
): (fact: TransactionFact) => boolean {
  return (fact) => {
    const abs = Math.abs(fact.amount);
    return abs >= min && abs <= max;
  };
}

export function isExpense(fact: TransactionFact): boolean {
  return fact.amount < 0;
}

export function isIncome(fact: TransactionFact): boolean {
  return fact.amount > 0;
}

// Compose conditions with AND logic
export function allOf(
  ...conditions: ((fact: TransactionFact) => boolean)[]
): (fact: TransactionFact) => boolean {
  return (fact) => conditions.every(cond => cond(fact));
}

// Compose conditions with OR logic
export function anyOf(
  ...conditions: ((fact: TransactionFact) => boolean)[]
): (fact: TransactionFact) => boolean {
  return (fact) => conditions.some(cond => cond(fact));
}
```

### 3.4 Hardcoded Starter Rules

These are system-level rules that apply to all users. They handle common transaction patterns that are universal across freelancers.

```typescript
// src/lib/rules/system-rules.ts

import { Rule } from './engine';
import { TransactionFact, CategorizationResult } from './categorization';
import { allOf, containsAny, isExpense, isIncome } from './conditions';

export const systemCategorizationRules: Rule<TransactionFact, CategorizationResult>[] = [

  // --- Transfers (check early — shouldn't be categorized as income/expense) ---
  {
    id: 'sys-transfer',
    name: 'Account transfers',
    priority: 5,
    condition: containsAny(
      (f) => f.description,
      ['transfer to', 'transfer from', 'own account', 'umbuchung', 'internal transfer']
    ),
    action: () => ({
      categorySlug: 'account-transfer',
      categoryName: 'Account Transfer',
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-transfer',
    }),
  },

  // --- Bank Fees ---
  {
    id: 'sys-bank-fees',
    name: 'Bank fees & charges',
    priority: 15,
    condition: allOf(
      isExpense,
      containsAny(
        (f) => f.description,
        ['bank fee', 'service charge', 'overdraft', 'atm fee', 'monthly fee',
         'wire fee', 'foreign transaction fee', 'kontoführung', 'account maintenance']
      )
    ),
    action: () => ({
      categorySlug: 'bank-fees',
      categoryName: 'Bank Fees',
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-bank-fees',
    }),
  },

  // --- Interest Income ---
  {
    id: 'sys-interest',
    name: 'Interest income',
    priority: 15,
    condition: allOf(
      isIncome,
      containsAny(
        (f) => f.description,
        ['interest', 'zinsen', 'interest earned', 'interest paid']
      )
    ),
    action: () => ({
      categorySlug: 'interest',
      categoryName: 'Interest',
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-interest',
    }),
  },

  // --- Software & Subscriptions ---
  {
    id: 'sys-software',
    name: 'Software & SaaS subscriptions',
    priority: 20,
    condition: allOf(
      isExpense,
      containsAny(
        (f) => `${f.description} ${f.merchantName}`,
        ['github', 'notion', 'figma', 'slack', 'zoom', 'dropbox', 'adobe',
         'google workspace', 'microsoft 365', 'aws', 'heroku', 'vercel',
         'netlify', 'digitalocean', 'openai', 'anthropic', 'linear',
         'canva', 'grammarly', '1password', 'cloudflare']
      )
    ),
    action: () => ({
      categorySlug: 'software-subscriptions',
      categoryName: 'Software & Subscriptions',
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-software',
    }),
  },

  // --- Travel ---
  {
    id: 'sys-travel',
    name: 'Travel expenses',
    priority: 30,
    condition: allOf(
      isExpense,
      containsAny(
        (f) => `${f.description} ${f.merchantName}`,
        ['airline', 'airways', 'ryanair', 'easyjet', 'lufthansa', 'delta',
         'united air', 'booking.com', 'airbnb', 'hotel', 'marriott', 'hilton',
         'uber', 'lyft', 'bolt', 'taxi', 'train', 'amtrak', 'eurostar',
         'deutsche bahn', 'national rail']
      )
    ),
    action: () => ({
      categorySlug: 'travel',
      categoryName: 'Travel',
      projectId: null,
      confidence: 'high',
      ruleId: 'sys-travel',
    }),
  },

  // --- Meals & Entertainment ---
  {
    id: 'sys-meals',
    name: 'Meals & dining',
    priority: 40,
    condition: allOf(
      isExpense,
      containsAny(
        (f) => `${f.description} ${f.merchantName}`,
        ['restaurant', 'cafe', 'coffee', 'starbucks', 'mcdonald',
         'deliveroo', 'uber eats', 'doordash', 'grubhub', 'just eat',
         'lieferando', 'pizza', 'sushi', 'burger']
      )
    ),
    action: () => ({
      categorySlug: 'meals-entertainment',
      categoryName: 'Meals & Entertainment',
      projectId: null,
      confidence: 'medium',  // could be personal, needs review
      ruleId: 'sys-meals',
    }),
  },

  // --- Office Supplies ---
  {
    id: 'sys-office',
    name: 'Office supplies & equipment',
    priority: 50,
    condition: allOf(
      isExpense,
      containsAny(
        (f) => `${f.description} ${f.merchantName}`,
        ['amazon', 'staples', 'office depot', 'ikea', 'apple store',
         'apple.com', 'media markt', 'currys', 'best buy']
      )
    ),
    action: () => ({
      categorySlug: 'office-supplies',
      categoryName: 'Office Supplies',
      projectId: null,
      confidence: 'medium',  // amazon could be anything
      ruleId: 'sys-office',
    }),
  },
];
```

### 3.5 User-Defined Rules

When a user manually categorizes or recategorizes a transaction, offer to save a rule from it. These are stored in the database and evaluated **before** system rules (lower priority number).

#### Prisma Schema Addition

```prisma
model CategorizationRule {
  id           String   @id @default(cuid())
  userId       String                           // Clerk userId — rules are per-user
  name         String                           // "WeWork → Rent"
  priority     Int      @default(50)            // 1-99 = user rules, 100+ = system
  conditions   Json                             // stored as JSON (see below)
  categorySlug String
  categoryName String
  projectId    String?
  project      Project?  @relation(fields: [projectId], references: [id])
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

#### Condition JSON Shape

Stored in the `conditions` JSONB column:

```json
{
  "all": [
    { "field": "merchantName", "operator": "contains", "value": "wework" },
    { "field": "amount", "operator": "lt", "value": 0 }
  ]
}
```

Supported operators: `contains`, `equals`, `starts_with`, `regex`, `gt`, `lt`, `between`, `in`.

#### Hydrating Stored Rules

```typescript
// src/lib/rules/user-rules.ts

import { prisma } from '@/lib/prisma';
import { Rule } from './engine';
import { TransactionFact, CategorizationResult } from './categorization';

export async function loadUserRules(
  userId: string
): Promise<Rule<TransactionFact, CategorizationResult>[]> {
  const rows = await prisma.categorizationRule.findMany({
    where: { userId, isActive: true },
    orderBy: { priority: 'asc' },
  });

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    priority: row.priority,
    condition: buildCondition(row.conditions as ConditionGroup),
    action: () => ({
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      projectId: row.projectId,
      confidence: 'high' as const,
      ruleId: row.id,
    }),
  }));
}

interface ConditionGroup {
  all?: ConditionDef[];
  any?: ConditionDef[];
}

interface ConditionDef {
  field: string;
  operator: string;
  value: string | number | string[] | [number, number];
}

function buildCondition(group: ConditionGroup): (fact: TransactionFact) => boolean {
  const conditions = group.all ?? group.any ?? [];
  const combiner = group.any ? 'some' : 'every';

  return (fact: TransactionFact) => {
    return conditions[combiner]((cond: ConditionDef) => {
      const fieldValue = getField(fact, cond.field);
      return evalOperator(fieldValue, cond.operator, cond.value);
    });
  };
}

function getField(fact: TransactionFact, field: string): string | number | null {
  switch (field) {
    case 'description': return fact.description;
    case 'merchantName': return fact.merchantName;
    case 'rawDescription': return fact.rawDescription;
    case 'amount': return fact.amount;
    case 'currency': return fact.currency;
    case 'bankName': return fact.bankName;
    default: return null;
  }
}

function evalOperator(
  fieldValue: string | number | null,
  operator: string,
  target: string | number | string[] | [number, number]
): boolean {
  if (fieldValue === null || fieldValue === undefined) return false;

  const strVal = String(fieldValue).toLowerCase();
  const strTarget = String(target).toLowerCase();

  switch (operator) {
    case 'contains':    return strVal.includes(strTarget);
    case 'equals':      return strVal === strTarget;
    case 'starts_with': return strVal.startsWith(strTarget);
    case 'regex':       return new RegExp(String(target), 'i').test(String(fieldValue));
    case 'gt':          return Number(fieldValue) > Number(target);
    case 'lt':          return Number(fieldValue) < Number(target);
    case 'gte':         return Number(fieldValue) >= Number(target);
    case 'lte':         return Number(fieldValue) <= Number(target);
    case 'in':          return (target as string[]).map(t => t.toLowerCase()).includes(strVal);
    case 'between': {
      const [min, max] = target as [number, number];
      return Number(fieldValue) >= min && Number(fieldValue) <= max;
    }
    default: return false;
  }
}
```

#### Creating a Rule from a User Correction

```typescript
// src/lib/rules/suggest-rule.ts

import { TransactionFact } from './categorization';
import { Prisma } from '@prisma/client';

interface UserCorrection {
  transaction: TransactionFact;
  categorySlug: string;
  categoryName: string;
  projectId: string | null;
}

export function buildRuleFromCorrection(
  correction: UserCorrection
): Omit<Prisma.CategorizationRuleCreateInput, 'userId'> {
  const { transaction: tx } = correction;

  const conditions: { all: object[] } = { all: [] };

  // Always match direction (expense vs income)
  conditions.all.push({
    field: 'amount',
    operator: tx.amount < 0 ? 'lt' : 'gt',
    value: 0,
  });

  // Prefer merchant name (most reliable signal)
  if (tx.merchantName && tx.merchantName.trim().length > 2) {
    conditions.all.push({
      field: 'merchantName',
      operator: 'contains',
      value: tx.merchantName.trim().toLowerCase(),
    });
  } else if (tx.description) {
    // Take the most distinctive keywords from the description
    const keywords = tx.description
      .split(/\s+/)
      .filter(w => w.length > 3 && !/^\d+$/.test(w))
      .slice(0, 3);

    if (keywords.length > 0) {
      conditions.all.push({
        field: 'description',
        operator: 'contains',
        value: keywords.join(' ').toLowerCase(),
      });
    }
  }

  const label = tx.merchantName || tx.description.slice(0, 30);

  return {
    name: `${label} → ${correction.categoryName}`,
    priority: 50,
    conditions: conditions as Prisma.InputJsonValue,
    categorySlug: correction.categorySlug,
    categoryName: correction.categoryName,
    projectId: correction.projectId,
  };
}
```

### 3.6 Putting It Together: The Categorization Pipeline

```typescript
// src/lib/rules/categorize-batch.ts

import { evaluateRules } from './engine';
import { TransactionFact, CategorizationResult } from './categorization';
import { systemCategorizationRules } from './system-rules';
import { loadUserRules } from './user-rules';

export interface CategorizedTransaction {
  transaction: TransactionFact;
  suggestion: CategorizationResult | null;
}

export async function categorizeBatch(
  transactions: TransactionFact[],
  userId: string
): Promise<CategorizedTransaction[]> {
  // User rules (priority 1-99) evaluated before system rules (100+)
  const userRules = await loadUserRules(userId);
  const allRules = [...userRules, ...systemCategorizationRules];

  return transactions.map(tx => {
    const results = evaluateRules(tx, allRules, 'first');
    return {
      transaction: tx,
      suggestion: results[0] ?? null,
    };
  });
}
```

This runs after `csv-processor.ts` produces normalized rows but before the import preview is shown. The preview displays the suggested category per row with a confidence indicator, and the user can accept, change, or clear each suggestion.

---

## 4. Column Mapping Rules

The existing `guessMapping()` in `column-mapper.tsx` already implements a rules engine — it's just not abstracted as one. Here's the pattern it follows and how to extend it.

### 4.1 Current Approach (Deterministic Regex)

Ranked patterns per field — first match wins. Normalizes headers to lowercase with spaces/underscores/dashes stripped before matching. See `column-mapper.tsx` for the full implementation.

### 4.2 Extending with LLM Fallback

The handoff doc notes there's a TODO for LLM-assisted mapping. The pattern should be:

1. Run `guessMapping()` (fast, deterministic, works for known banks)
2. If any required fields are unmapped, call an LLM with the raw headers + a few sample rows
3. Merge: LLM fills in the blanks, regex results take priority where they matched

```typescript
// src/lib/csv-mapper.ts

export async function mapColumns(
  headers: string[],
  sampleRows: string[][],         // first 3-5 rows for LLM context
  useLlm: boolean = true
): Promise<CsvMapping> {
  const regexResult = guessMapping(headers);

  const unmappedFields = (['dateCol', 'amountCol', 'descCol'] as const)
    .filter(f => !regexResult[f]);

  if (unmappedFields.length === 0 || !useLlm) {
    return regexResult as CsvMapping;
  }

  try {
    const llmResult = await llmMapColumns(headers, sampleRows, unmappedFields);
    return {
      dateCol: regexResult.dateCol ?? llmResult.dateCol,
      amountCol: regexResult.amountCol ?? llmResult.amountCol,
      descCol: regexResult.descCol ?? llmResult.descCol,
      merchantCol: regexResult.merchantCol ?? llmResult.merchantCol,
      dateFormat: regexResult.dateFormat ?? llmResult.dateFormat ?? 'MM/DD/YYYY',
      amountSign: regexResult.amountSign ?? 'normal',
    };
  } catch {
    return regexResult as CsvMapping;
  }
}

async function llmMapColumns(
  headers: string[],
  sampleRows: string[][],
  fieldsNeeded: string[]
): Promise<Partial<CsvMapping>> {
  // Call Claude API (or similar) here — runs server-side only.
  // Prompt: include headers, sample rows, fields needed, expected JSON output.
  throw new Error('LLM mapper not yet implemented');
}
```

---

## 5. Import Validation Rules

These run over the normalized `PreviewRow[]` before the user can commit the import. They use **all-match** — surface every problem, not just the first.

### 5.1 Types

```typescript
// src/lib/rules/validation.ts

export interface ImportValidationResult {
  valid: boolean;
  code: string;
  message: string;
  severity: 'error' | 'warning';
  rowIndex?: number;
}
```

### 5.2 Batch-Level Rules

```typescript
export const batchValidationRules: Rule<{ rows: PreviewRow[] }, ImportValidationResult>[] = [
  {
    id: 'batch-not-empty',
    name: 'CSV must contain rows',
    priority: 1,
    condition: (fact) => fact.rows.length === 0,
    action: () => ({
      valid: false, code: 'EMPTY_CSV',
      message: 'The CSV file contains no data rows',
      severity: 'error',
    }),
  },
  {
    id: 'batch-size-limit',
    name: 'Reasonable batch size',
    priority: 2,
    condition: (fact) => fact.rows.length > 5000,
    action: (fact) => ({
      valid: false, code: 'BATCH_TOO_LARGE',
      message: `CSV has ${fact.rows.length} rows. Maximum is 5,000 per import.`,
      severity: 'error',
    }),
  },
];
```

### 5.3 Row-Level Rules

```typescript
export const rowValidationRules: Rule<PreviewRowFact, ImportValidationResult>[] = [
  {
    id: 'row-date-required',
    name: 'Date is required',
    priority: 1,
    condition: (fact) => !fact.row.date || isNaN(new Date(fact.row.date).getTime()),
    action: (fact) => ({
      valid: false, code: 'INVALID_DATE',
      message: `Row ${fact.rowIndex + 1}: missing or unparseable date`,
      severity: 'error', rowIndex: fact.rowIndex,
    }),
  },
  {
    id: 'row-amount-required',
    name: 'Amount is required',
    priority: 2,
    condition: (fact) => fact.row.amount === null || fact.row.amount === undefined || isNaN(Number(fact.row.amount)),
    action: (fact) => ({
      valid: false, code: 'INVALID_AMOUNT',
      message: `Row ${fact.rowIndex + 1}: missing or non-numeric amount`,
      severity: 'error', rowIndex: fact.rowIndex,
    }),
  },
  {
    id: 'row-zero-amount',
    name: 'Zero amounts are suspicious',
    priority: 10,
    condition: (fact) => Number(fact.row.amount) === 0,
    action: (fact) => ({
      valid: false, code: 'ZERO_AMOUNT',
      message: `Row ${fact.rowIndex + 1}: amount is zero — intentional?`,
      severity: 'warning', rowIndex: fact.rowIndex,
    }),
  },
  {
    id: 'row-duplicate',
    name: 'Duplicate transaction',
    priority: 3,
    condition: (fact) => fact.existingHashes.has(fact.row.duplicateHash ?? ''),
    action: (fact) => ({
      valid: false, code: 'DUPLICATE',
      message: `Row ${fact.rowIndex + 1}: already imported (duplicate hash)`,
      severity: 'warning', rowIndex: fact.rowIndex,
    }),
  },
  {
    id: 'row-future-date',
    name: 'Future dates are suspicious',
    priority: 8,
    condition: (fact) => new Date(fact.row.date).getTime() > Date.now() + 86400000,
    action: (fact) => ({
      valid: false, code: 'FUTURE_DATE',
      message: `Row ${fact.rowIndex + 1}: date is in the future`,
      severity: 'warning', rowIndex: fact.rowIndex,
    }),
  },
];
```

### 5.4 Running Validation

```typescript
// src/lib/rules/validate-import.ts

export function validateImportBatch(
  rows: PreviewRow[],
  existingHashes: Set<string>
): { errors: ImportValidationResult[]; warnings: ImportValidationResult[]; isValid: boolean } {
  const results: ImportValidationResult[] = [];

  const batchResults = evaluateRules({ rows }, batchValidationRules, 'all');
  results.push(...batchResults);

  if (!batchResults.some(r => r.severity === 'error')) {
    for (let i = 0; i < rows.length; i++) {
      const rowResults = evaluateRules(
        { rows, row: rows[i], rowIndex: i, existingHashes },
        rowValidationRules,
        'all'
      );
      results.push(...rowResults);
    }
  }

  return {
    errors: results.filter(r => r.severity === 'error'),
    warnings: results.filter(r => r.severity === 'warning'),
    isValid: !results.some(r => r.severity === 'error'),
  };
}
```

---

## 6. Where Everything Lives (File Layout)

```
src/lib/rules/
  engine.ts               — ~20 line generic evaluator
  conditions.ts           — reusable condition builders
  categorization.ts       — TransactionFact + CategorizationResult types
  system-rules.ts         — hardcoded categorization rules for common patterns
  user-rules.ts           — load CategorizationRule rows from Prisma, hydrate into Rules
  suggest-rule.ts         — buildRuleFromCorrection() — turn a manual edit into a saved rule
  categorize-batch.ts     — pipeline: load rules → evaluate batch → return suggestions
  validation.ts           — ImportValidationResult type + batch & row validation rules
  validate-import.ts      — validateImportBatch() — run all validation, return errors/warnings
```

---

## 7. Integration Points

### Where categorization hooks in

Slots between `csv-processor.ts` output and the import preview:

```
CSV → PapaParse → column mapper → csv-processor → ★ categorizeBatch() → preview → commit
```

The preview component (`import-preview.tsx`) should display the suggested category per row with a confidence indicator. On commit, the accepted category is saved to the Transaction.

### Where validation hooks in

Runs when the user clicks "Import" in the preview:

```
User clicks "Import" → ★ validateImportBatch() → errors block / warnings dismissible → POST /api/transactions/import
```

### Where user rule creation hooks in

When a user changes a transaction's category via inline editing in `TransactionTable`, after the PATCH succeeds:

```
User edits category → PATCH /api/transactions/[id] → success → "Save as rule?" prompt → POST /api/rules
```

New API route needed: `src/app/api/rules/route.ts` (GET user rules, POST new rule).

---

## 8. Testing Strategy

### Unit Tests

```typescript
describe('system categorization rules', () => {
  it('categorizes GitHub charge as Software', () => {
    const tx = makeFact({ description: 'GITHUB INC', amount: -400, merchantName: 'GitHub' });
    const results = evaluateRules(tx, systemCategorizationRules, 'first');
    expect(results[0]?.categorySlug).toBe('software-subscriptions');
  });

  it('identifies transfers before expenses', () => {
    const tx = makeFact({ description: 'Transfer to savings', amount: -50000 });
    const results = evaluateRules(tx, systemCategorizationRules, 'first');
    expect(results[0]?.categorySlug).toBe('account-transfer');
  });

  it('returns no match for unrecognized transactions', () => {
    const tx = makeFact({ description: 'RANDOM CORP ABC123', amount: -999, merchantName: null });
    expect(evaluateRules(tx, systemCategorizationRules, 'first')).toHaveLength(0);
  });
});
```

### Integration Tests

```typescript
describe('user rule persistence', () => {
  it('saved rule matches on next import', async () => {
    await prisma.categorizationRule.create({ /* WeWork → Rent */ });
    const rules = await loadUserRules(testUserId);
    const tx = makeFact({ merchantName: 'WeWork', amount: -45000 });
    const results = evaluateRules(tx, [...rules, ...systemCategorizationRules], 'first');
    expect(results[0]?.categorySlug).toBe('rent');
    expect(results[0]?.ruleId).not.toMatch(/^sys-/); // user rule matched, not system
  });
});
```

### Validation Tests

```typescript
describe('import validation', () => {
  it('rejects empty CSV', () => {
    const result = validateImportBatch([], new Set());
    expect(result.isValid).toBe(false);
    expect(result.errors[0]?.code).toBe('EMPTY_CSV');
  });

  it('flags existing hashes as warnings not errors', () => {
    const rows = [makePreviewRow({ duplicateHash: 'abc123' })];
    const result = validateImportBatch(rows, new Set(['abc123']));
    expect(result.isValid).toBe(true);   // warning only, not blocking
    expect(result.warnings[0]?.code).toBe('DUPLICATE');
  });
});
```

---

## 9. Key Design Decisions

1. **User rules evaluate before system rules.** User rules get priority 1–99, system rules 100+. User's explicit preferences always win.

2. **First-match for categorization, all-match for validation.** A transaction gets one category. Validation surfaces every problem.

3. **Rules are data, not code (for user rules).** Stored as JSON conditions in PostgreSQL. System rules are code but implement the same interface.

4. **Confidence levels matter.** `high` = auto-apply (bank fees, known SaaS). `medium` = show suggestion, require user confirmation (restaurants could be personal).

5. **The engine is ~20 lines on purpose.** Value is in the rules. Don't over-abstract the engine.

6. **Uncategorized is fine.** Unlike a full accounting system, transactions can remain uncategorized. They'll appear in reports as "Uncategorized" until the user tags them.

---

*This document lives at `docs/rules-engine-reference.md` in the project repo.
Companion doc: `docs/accounting-reference.md` (domain model, architecture, category taxonomy).*
