import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const institutions = [
  // US Banks
  {
    name: 'Chase Credit Card',
    country: 'US',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Transaction Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'MM/DD/YYYY',
      amountSign: 'inverted', // Chase exports debits as negative already, but credit card format varies
      merchantCol: undefined,
    },
  },
  {
    name: 'Chase Checking',
    country: 'US',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Posting Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'MM/DD/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'Capital One',
    country: 'US',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Transaction Date',
      amountCol: 'Debit',
      descCol: 'Description',
      dateFormat: 'YYYY-MM-DD',
      amountSign: 'inverted',
      merchantCol: undefined,
    },
  },
  {
    name: 'Bank of America',
    country: 'US',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'MM/DD/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  // DE Banks
  {
    name: 'N26',
    country: 'DE',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount (EUR)',
      descCol: 'Payment reference',
      dateFormat: 'YYYY-MM-DD',
      amountSign: 'normal',
      merchantCol: 'Payee',
    },
  },
  // UK Banks
  {
    name: 'Monzo',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount',
      descCol: 'Name',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: 'Name',
    },
  },
  {
    name: 'Starling Bank',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount (GBP)',
      descCol: 'Counter Party',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: 'Counter Party',
    },
  },
  {
    name: 'Barclays',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount',
      descCol: 'Memo',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'HSBC UK',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Paid out',
      descCol: 'Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'inverted',
      merchantCol: undefined,
    },
  },
  {
    name: 'Lloyds Bank',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Transaction Date',
      amountCol: 'Debit Amount',
      descCol: 'Transaction Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'inverted',
      merchantCol: undefined,
    },
  },
  {
    name: 'NatWest',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Value',
      descCol: 'Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'Halifax',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Transaction Date',
      amountCol: 'Debit Amount',
      descCol: 'Transaction Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'inverted',
      merchantCol: undefined,
    },
  },
  {
    name: 'Santander UK',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'TSB',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Transaction Date',
      amountCol: 'Debit',
      descCol: 'Description',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'inverted',
      merchantCol: undefined,
    },
  },
  {
    name: 'Revolut',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Started Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'YYYY-MM-DD',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'Wise',
    country: 'UK',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Amount',
      descCol: 'Description',
      dateFormat: 'DD-MM-YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  // EU Banks
  {
    name: 'BNP Paribas',
    country: 'FR',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Date',
      amountCol: 'Montant',
      descCol: 'Libellé',
      dateFormat: 'DD/MM/YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'Deutsche Bank',
    country: 'DE',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Booking date',
      amountCol: 'Amount',
      descCol: 'Beneficiary / Originator',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'ING',
    country: 'DE',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Buchung',
      amountCol: 'Betrag',
      descCol: 'Auftraggeber/Begünstigter',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
  {
    name: 'Commerzbank',
    country: 'DE',
    isGlobal: true,
    csvMapping: {
      dateCol: 'Buchungstag',
      amountCol: 'Betrag',
      descCol: 'Buchungstext',
      dateFormat: 'DD.MM.YYYY',
      amountSign: 'normal',
      merchantCol: undefined,
    },
  },
]

async function main() {
  console.log('Seeding institution schemas…')

  for (const inst of institutions) {
    await prisma.institutionSchema.upsert({
      where: {
        // Use name+country as logical unique key — add a unique constraint if desired
        id: `seed-${inst.name.toLowerCase().replace(/\s+/g, '-')}-${inst.country.toLowerCase()}`,
      },
      update: { csvMapping: inst.csvMapping },
      create: {
        id: `seed-${inst.name.toLowerCase().replace(/\s+/g, '-')}-${inst.country.toLowerCase()}`,
        ...inst,
      },
    })
    console.log(`  ✓ ${inst.name} (${inst.country})`)
  }

  console.log(`Done. Seeded ${institutions.length} institution schemas.`)
}

// Only run main when executed directly (not when imported)
if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
