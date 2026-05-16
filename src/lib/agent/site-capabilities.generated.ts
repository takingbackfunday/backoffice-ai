// AUTO-GENERATED — do not edit by hand. Run: pnpm run build:capabilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _data: any[] = [
  {
    "route": "/accounts",
    "title": "Accounts",
    "purpose": "Manage bank and financial accounts — view balances, types, and transaction counts.",
    "jobsToBeDone": [
      "See all accounts with current balances and transaction counts",
      "Add a new manual account",
      "View what currency each account uses"
    ],
    "deepLinks": {},
    "reads": [
      "Account",
      "Transaction"
    ],
    "writes": [
      "Account"
    ],
    "relatedRoutes": [
      "/transactions",
      "/connections",
      "/bank-sync"
    ]
  },
  {
    "route": "/bank-sync",
    "title": "Bank sync",
    "purpose": "Manually trigger a sync for connected bank accounts to pull in the latest transactions.",
    "jobsToBeDone": [
      "Trigger a manual sync for a connected bank account",
      "See when the last sync ran and how many transactions were imported",
      "Check the status of a running sync job"
    ],
    "deepLinks": {},
    "reads": [
      "SyncJob",
      "Account"
    ],
    "writes": [
      "Transaction",
      "SyncJob"
    ],
    "relatedRoutes": [
      "/connections",
      "/transactions",
      "/accounts"
    ]
  },
  {
    "route": "/connections",
    "title": "Bank connections",
    "purpose": "Connect bank accounts for automatic transaction sync via Plaid (US), Finexer (UK), or Enable Banking (EU).",
    "jobsToBeDone": [
      "Connect a US bank account via Plaid",
      "Connect a UK bank account via Finexer",
      "Connect a European bank account via Enable Banking (29 countries)",
      "Disconnect or refresh an existing bank connection",
      "View connection status and last sync time"
    ],
    "deepLinks": {},
    "reads": [
      "Account",
      "SyncJob"
    ],
    "writes": [
      "Account",
      "EncryptedCredential"
    ],
    "relatedRoutes": [
      "/bank-sync",
      "/accounts",
      "/transactions"
    ]
  },
  {
    "route": "/dashboard",
    "title": "Dashboard",
    "purpose": "Overview of finances — KPIs, cashflow chart, net worth, and expenses by category.",
    "jobsToBeDone": [
      "See income, expenses, and net balance at a glance",
      "Chart cashflow over a custom date range",
      "Track net worth across all accounts",
      "See top expense categories for a period",
      "Switch the display currency"
    ],
    "deepLinks": {},
    "reads": [
      "Transaction",
      "Account",
      "Category",
      "CategoryGroup",
      "FxRate"
    ],
    "writes": [],
    "relatedRoutes": [
      "/transactions",
      "/pivot",
      "/accounts"
    ]
  },
  {
    "route": "/payees",
    "title": "Payees",
    "purpose": "Manage payees — assign default categories to vendors, merchants, and income sources.",
    "jobsToBeDone": [
      "See all payees with their default categories and transaction counts",
      "Assign or change a payee's default category",
      "Search payees by name",
      "Delete unused payees"
    ],
    "deepLinks": {},
    "reads": [
      "Payee",
      "Category"
    ],
    "writes": [
      "Payee"
    ],
    "relatedRoutes": [
      "/rules",
      "/transactions"
    ]
  },
  {
    "route": "/pivot",
    "title": "Pivot table",
    "purpose": "Flexible pivot table for slicing and aggregating transaction data by any dimension.",
    "jobsToBeDone": [
      "Group transactions by category, account, project, payee, or time period",
      "Compare income and expenses across different dimensions",
      "Toggle subtotals, grand totals, and decimal display",
      "Export pivot data to CSV",
      "Save and load named pivot presets"
    ],
    "deepLinks": {},
    "reads": [
      "Transaction",
      "Category",
      "Account",
      "Payee"
    ],
    "writes": [],
    "relatedRoutes": [
      "/transactions",
      "/dashboard"
    ]
  },
  {
    "route": "/portfolio",
    "title": "Portfolio",
    "purpose": "Property portfolio dashboard showing occupancy rates, rent roll, and maintenance overview.",
    "jobsToBeDone": [
      "See occupancy rates across all properties",
      "View total monthly rent and vacancy loss",
      "Check which leases are expiring soon",
      "See open maintenance requests across all properties",
      "Navigate to a specific property"
    ],
    "deepLinks": {},
    "reads": [
      "Project",
      "Unit",
      "Lease",
      "MaintenanceRequest",
      "Tenant"
    ],
    "writes": [],
    "relatedRoutes": [
      "/projects"
    ]
  },
  {
    "route": "/projects",
    "title": "Projects",
    "purpose": "List all workspaces — CLIENT (freelance), PROPERTY, and OTHER — with creation shortcuts.",
    "jobsToBeDone": [
      "See all projects and their type (client, property, other)",
      "Create a new client, property, or other project",
      "Create a new work order or intake a subcontractor bill",
      "Navigate to a specific project's detail page"
    ],
    "deepLinks": {},
    "reads": [
      "Project",
      "ClientProfile",
      "Unit"
    ],
    "writes": [
      "Project",
      "WorkOrder",
      "Bill"
    ],
    "relatedRoutes": [
      "/studio",
      "/portfolio"
    ]
  },
  {
    "route": "/receipts",
    "title": "Receipts",
    "purpose": "Upload and OCR receipts — automatically extracts vendor, amount, date, and tax.",
    "jobsToBeDone": [
      "Upload a receipt image or PDF for OCR processing",
      "View extracted receipt data (vendor, amount, date, tax)",
      "Link a receipt to a matching bank transaction",
      "Retry failed OCR processing",
      "Delete or edit receipt records"
    ],
    "deepLinks": {},
    "reads": [
      "Receipt",
      "Transaction"
    ],
    "writes": [
      "Receipt"
    ],
    "relatedRoutes": [
      "/transactions"
    ]
  },
  {
    "route": "/rules",
    "title": "Categorisation rules",
    "purpose": "Create and manage rules that auto-categorise transactions on import.",
    "jobsToBeDone": [
      "Create, edit, delete, or reorder categorisation rules",
      "View and accept AI-suggested rules",
      "Run the AI rules agent to generate new suggestions",
      "See which categories and payees rules assign"
    ],
    "deepLinks": {},
    "reads": [
      "CategorizationRule",
      "RuleSuggestion",
      "Transaction",
      "Category",
      "Payee"
    ],
    "writes": [
      "CategorizationRule",
      "RuleSuggestion"
    ],
    "relatedRoutes": [
      "/transactions"
    ]
  },
  {
    "route": "/settings",
    "title": "Settings",
    "purpose": "Manage user preferences, business info, payment methods, and invoice defaults.",
    "jobsToBeDone": [
      "Change business name, address, email, phone, VAT number, or website",
      "Add or edit payment methods (bank transfer, PayPal, Stripe, custom)",
      "Set default text for invoice notes and payment instructions",
      "Configure margin rules used in quote generation"
    ],
    "deepLinks": {
      "business-name": "#business-name",
      "business-address": "#business-address",
      "invoice-notes-default": "#invoice-notes-default",
      "payment-instructions": "#payment-instructions",
      "payment-methods": "#payment-methods",
      "margin-rules": "#margin-rules"
    },
    "reads": [
      "UserPreference",
      "MarginRule"
    ],
    "writes": [
      "UserPreference",
      "MarginRule"
    ],
    "relatedRoutes": [
      "/projects/[slug]/invoices/new",
      "/projects/[slug]/estimates/new"
    ]
  },
  {
    "route": "/studio",
    "title": "Client Hub",
    "purpose": "Overview of all freelance clients — outstanding invoices, overdue amounts, and quick invoice/work-order actions.",
    "jobsToBeDone": [
      "See which clients owe money (overdue and outstanding balances)",
      "Create a new invoice for a client",
      "Mark unsent draft invoices as sent",
      "Create a new work order or intake a subcontractor bill",
      "Filter client cards by payment status (overdue, outstanding, collected)"
    ],
    "deepLinks": {},
    "reads": [
      "Project",
      "Invoice",
      "Quote",
      "ClientProfile",
      "Job"
    ],
    "writes": [
      "Invoice",
      "WorkOrder",
      "Bill"
    ],
    "relatedRoutes": [
      "/projects",
      "/vendors"
    ]
  },
  {
    "route": "/transactions",
    "title": "Transactions",
    "purpose": "Browse, search, edit, categorise, and bulk-delete bank transactions.",
    "jobsToBeDone": [
      "Search transactions by description, payee, category, or date",
      "Edit a transaction's category, payee, project, or notes",
      "Bulk delete duplicate or unwanted transactions",
      "Create a categorisation rule from an edited row",
      "Filter by account or project"
    ],
    "deepLinks": {},
    "reads": [
      "Transaction",
      "Category",
      "Payee",
      "Project",
      "CategorizationRule"
    ],
    "writes": [
      "Transaction",
      "CategorizationRule"
    ],
    "relatedRoutes": [
      "/upload",
      "/rules",
      "/accounts"
    ]
  },
  {
    "route": "/upload",
    "title": "Upload transactions",
    "purpose": "Import bank transactions from a CSV file with AI-assisted column mapping.",
    "jobsToBeDone": [
      "Drop a CSV file from any bank to import transactions",
      "Use AI suggestions to map CSV columns to the right fields",
      "Preview which transactions will be imported and which are duplicates",
      "Trigger automatic categorisation via rules after import"
    ],
    "deepLinks": {},
    "reads": [
      "InstitutionSchema",
      "CategorizationRule"
    ],
    "writes": [
      "Transaction",
      "ImportBatch"
    ],
    "relatedRoutes": [
      "/transactions",
      "/connections",
      "/rules"
    ]
  },
  {
    "route": "/vendors",
    "title": "Vendors",
    "purpose": "Manage subcontractors and vendors — view payment history, documents, and add new vendors.",
    "jobsToBeDone": [
      "See all vendors and subcontractors with their contact and tax info",
      "Add a new vendor or subcontractor",
      "View total paid to a vendor across all work orders",
      "Navigate to a vendor's detail page for documents and payment history"
    ],
    "deepLinks": {},
    "reads": [
      "Vendor",
      "VendorDocument",
      "WorkOrder",
      "Bill"
    ],
    "writes": [
      "Vendor"
    ],
    "relatedRoutes": [
      "/vendors/[vendorId]"
    ]
  }
]
export { _data as SITE_CAPABILITIES }
export const SITE_CAPABILITY_INDEX: Record<string, number[]> = {
  "accounts": [
    0,
    1,
    2,
    3
  ],
  "manage": [
    0,
    4,
    9,
    10,
    14
  ],
  "bank": [
    0,
    1,
    2,
    8,
    10,
    12,
    13
  ],
  "financial": [
    0
  ],
  "view": [
    0,
    2,
    6,
    8,
    9,
    14
  ],
  "balances": [
    0,
    11
  ],
  "types": [
    0
  ],
  "transaction": [
    0,
    2,
    4,
    5,
    8,
    12
  ],
  "counts": [
    0,
    4
  ],
  "with": [
    0,
    4,
    7,
    13,
    14
  ],
  "current": [
    0
  ],
  "manual": [
    0,
    1
  ],
  "account": [
    0,
    1,
    2,
    5,
    12
  ],
  "what": [
    0
  ],
  "currency": [
    0,
    3
  ],
  "each": [
    0
  ],
  "uses": [
    0
  ],
  "sync": [
    1,
    2
  ],
  "manually": [
    1
  ],
  "trigger": [
    1,
    13
  ],
  "connected": [
    1
  ],
  "pull": [
    1
  ],
  "latest": [
    1
  ],
  "transactions": [
    1,
    5,
    9,
    12,
    13
  ],
  "when": [
    1
  ],
  "last": [
    1,
    2
  ],
  "many": [
    1
  ],
  "were": [
    1
  ],
  "imported": [
    1,
    13
  ],
  "check": [
    1,
    6
  ],
  "status": [
    1,
    2,
    11
  ],
  "running": [
    1
  ],
  "connections": [
    2
  ],
  "connect": [
    2
  ],
  "automatic": [
    2,
    13
  ],
  "plaid": [
    2
  ],
  "finexer": [
    2
  ],
  "enable": [
    2
  ],
  "banking": [
    2
  ],
  "european": [
    2
  ],
  "countries": [
    2
  ],
  "disconnect": [
    2
  ],
  "refresh": [
    2
  ],
  "existing": [
    2
  ],
  "connection": [
    2
  ],
  "time": [
    2,
    5
  ],
  "dashboard": [
    3,
    6
  ],
  "overview": [
    3,
    6,
    11
  ],
  "finances": [
    3
  ],
  "kpis": [
    3
  ],
  "cashflow": [
    3
  ],
  "chart": [
    3
  ],
  "worth": [
    3
  ],
  "expenses": [
    3,
    5
  ],
  "category": [
    3,
    4,
    5,
    12
  ],
  "income": [
    3,
    4,
    5
  ],
  "balance": [
    3
  ],
  "glance": [
    3
  ],
  "over": [
    3
  ],
  "custom": [
    3,
    10
  ],
  "date": [
    3,
    8,
    12
  ],
  "range": [
    3
  ],
  "track": [
    3
  ],
  "across": [
    3,
    5,
    6,
    14
  ],
  "expense": [
    3
  ],
  "categories": [
    3,
    4,
    9
  ],
  "period": [
    3,
    5
  ],
  "switch": [
    3
  ],
  "display": [
    3,
    5
  ],
  "payees": [
    4,
    9
  ],
  "assign": [
    4,
    9
  ],
  "default": [
    4,
    10
  ],
  "vendors": [
    4,
    14
  ],
  "merchants": [
    4
  ],
  "sources": [
    4
  ],
  "their": [
    4,
    7,
    14
  ],
  "change": [
    4,
    10
  ],
  "payee": [
    4,
    5,
    12
  ],
  "search": [
    4,
    12
  ],
  "name": [
    4,
    10
  ],
  "delete": [
    4,
    8,
    9,
    12
  ],
  "unused": [
    4
  ],
  "pivot": [
    5
  ],
  "table": [
    5
  ],
  "flexible": [
    5
  ],
  "slicing": [
    5
  ],
  "aggregating": [
    5
  ],
  "data": [
    5,
    8
  ],
  "dimension": [
    5
  ],
  "group": [
    5
  ],
  "project": [
    5,
    7,
    12
  ],
  "compare": [
    5
  ],
  "different": [
    5
  ],
  "dimensions": [
    5
  ],
  "toggle": [
    5
  ],
  "subtotals": [
    5
  ],
  "grand": [
    5
  ],
  "totals": [
    5
  ],
  "decimal": [
    5
  ],
  "export": [
    5
  ],
  "save": [
    5
  ],
  "load": [
    5
  ],
  "named": [
    5
  ],
  "presets": [
    5
  ],
  "portfolio": [
    6
  ],
  "property": [
    6,
    7
  ],
  "showing": [
    6
  ],
  "occupancy": [
    6
  ],
  "rates": [
    6
  ],
  "rent": [
    6
  ],
  "roll": [
    6
  ],
  "maintenance": [
    6
  ],
  "properties": [
    6
  ],
  "total": [
    6,
    14
  ],
  "monthly": [
    6
  ],
  "vacancy": [
    6
  ],
  "loss": [
    6
  ],
  "which": [
    6,
    9,
    11,
    13
  ],
  "leases": [
    6
  ],
  "expiring": [
    6
  ],
  "soon": [
    6
  ],
  "open": [
    6
  ],
  "requests": [
    6
  ],
  "navigate": [
    6,
    7,
    14
  ],
  "specific": [
    6,
    7
  ],
  "projects": [
    7
  ],
  "list": [
    7
  ],
  "workspaces": [
    7
  ],
  "client": [
    7,
    11
  ],
  "freelance": [
    7,
    11
  ],
  "other": [
    7
  ],
  "creation": [
    7
  ],
  "shortcuts": [
    7
  ],
  "type": [
    7
  ],
  "create": [
    7,
    9,
    11,
    12
  ],
  "work": [
    7,
    11,
    14
  ],
  "order": [
    7,
    11
  ],
  "intake": [
    7,
    11
  ],
  "subcontractor": [
    7,
    11,
    14
  ],
  "bill": [
    7,
    11
  ],
  "detail": [
    7,
    14
  ],
  "page": [
    7,
    14
  ],
  "receipts": [
    8
  ],
  "upload": [
    8,
    13
  ],
  "automatically": [
    8
  ],
  "extracts": [
    8
  ],
  "vendor": [
    8,
    14
  ],
  "amount": [
    8
  ],
  "receipt": [
    8
  ],
  "image": [
    8
  ],
  "processing": [
    8
  ],
  "extracted": [
    8
  ],
  "link": [
    8
  ],
  "matching": [
    8
  ],
  "retry": [
    8
  ],
  "failed": [
    8
  ],
  "edit": [
    8,
    9,
    10,
    12
  ],
  "records": [
    8
  ],
  "categorisation": [
    9,
    12,
    13
  ],
  "rules": [
    9,
    10,
    13
  ],
  "that": [
    9
  ],
  "auto": [
    9
  ],
  "categorise": [
    9,
    12
  ],
  "import": [
    9,
    13
  ],
  "reorder": [
    9
  ],
  "accept": [
    9
  ],
  "suggested": [
    9
  ],
  "agent": [
    9
  ],
  "generate": [
    9
  ],
  "suggestions": [
    9,
    13
  ],
  "settings": [
    10
  ],
  "user": [
    10
  ],
  "preferences": [
    10
  ],
  "business": [
    10
  ],
  "info": [
    10,
    14
  ],
  "payment": [
    10,
    11,
    14
  ],
  "methods": [
    10
  ],
  "invoice": [
    10,
    11
  ],
  "defaults": [
    10
  ],
  "address": [
    10
  ],
  "email": [
    10
  ],
  "phone": [
    10
  ],
  "number": [
    10
  ],
  "website": [
    10
  ],
  "transfer": [
    10
  ],
  "paypal": [
    10
  ],
  "stripe": [
    10
  ],
  "text": [
    10
  ],
  "notes": [
    10,
    12
  ],
  "instructions": [
    10
  ],
  "configure": [
    10
  ],
  "margin": [
    10
  ],
  "used": [
    10
  ],
  "quote": [
    10
  ],
  "generation": [
    10
  ],
  "clients": [
    11
  ],
  "outstanding": [
    11
  ],
  "invoices": [
    11
  ],
  "overdue": [
    11
  ],
  "amounts": [
    11
  ],
  "quick": [
    11
  ],
  "actions": [
    11
  ],
  "money": [
    11
  ],
  "mark": [
    11
  ],
  "unsent": [
    11
  ],
  "draft": [
    11
  ],
  "sent": [
    11
  ],
  "filter": [
    11,
    12
  ],
  "cards": [
    11
  ],
  "collected": [
    11
  ],
  "studio": [
    11
  ],
  "browse": [
    12
  ],
  "bulk": [
    12
  ],
  "description": [
    12
  ],
  "duplicate": [
    12
  ],
  "unwanted": [
    12
  ],
  "rule": [
    12
  ],
  "from": [
    12,
    13
  ],
  "edited": [
    12
  ],
  "file": [
    13
  ],
  "assisted": [
    13
  ],
  "column": [
    13
  ],
  "mapping": [
    13
  ],
  "drop": [
    13
  ],
  "columns": [
    13
  ],
  "right": [
    13
  ],
  "fields": [
    13
  ],
  "preview": [
    13
  ],
  "will": [
    13
  ],
  "duplicates": [
    13
  ],
  "after": [
    13
  ],
  "subcontractors": [
    14
  ],
  "history": [
    14
  ],
  "documents": [
    14
  ],
  "contact": [
    14
  ],
  "paid": [
    14
  ],
  "orders": [
    14
  ]
}
