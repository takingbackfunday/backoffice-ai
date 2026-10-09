// AUTO-GENERATED — do not edit by hand. Run: pnpm run build:capabilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _data: any[] = [
  {
    "route": "/accounts/new",
    "title": "Add account",
    "purpose": "Manually add a new bank or financial account — set type, currency, country, and opening balance.",
    "jobsToBeDone": [
      "Add a checking, savings, business, or credit card account manually",
      "Set the account currency and country",
      "Set an opening balance"
    ],
    "deepLinks": {},
    "reads": [],
    "writes": [
      "Account",
      "Institution"
    ],
    "relatedRoutes": [
      "/accounts",
      "/bank-accounts"
    ]
  },
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
      "/bank-accounts"
    ]
  },
  {
    "route": "/bank-accounts",
    "title": "Bank accounts",
    "purpose": "View and manage bank accounts and cards, fetch transactions from supported banks, and manage remembered bank-browser data.",
    "jobsToBeDone": [
      "See all bank accounts and cards",
      "Add a new bank account manually",
      "Fetch the latest transactions from a supported Chase or N26 account",
      "Forget the trusted-device browser profile or learned export route"
    ],
    "deepLinks": {},
    "reads": [
      "Account",
      "Institution"
    ],
    "writes": [
      "Account"
    ],
    "relatedRoutes": [
      "/accounts/new",
      "/transactions"
    ]
  },
  {
    "route": "/categories",
    "title": "Categories",
    "purpose": "Manage transaction category groups and categories — add, rename, reorder, and mark categories as non-deductible.",
    "jobsToBeDone": [
      "Add a new category or category group",
      "Rename or delete an existing category",
      "Reorder categories within a group",
      "Mark a category as non-deductible (excluded from tax reports)",
      "Reset categories to defaults for a specific business type",
      "See how many transactions are tagged to each category"
    ],
    "deepLinks": {},
    "reads": [
      "CategoryGroup",
      "Category",
      "UserPreference"
    ],
    "writes": [
      "CategoryGroup",
      "Category",
      "UserPreference"
    ],
    "relatedRoutes": [
      "/transactions",
      "/rules",
      "/settings"
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
    "route": "/projects/[slug]/financials",
    "title": "Project financials",
    "purpose": "Financial summary for a single project — transactions, receipts, income vs. expenses, and categorisation.",
    "jobsToBeDone": [
      "See all transactions attributed to this project",
      "View income and expense totals for the project",
      "Categorise or re-categorise project transactions",
      "See receipts linked to project expenses",
      "Filter by date range or category"
    ],
    "deepLinks": {},
    "reads": [
      "Transaction",
      "Receipt",
      "CategoryGroup",
      "Category",
      "Payee"
    ],
    "writes": [
      "Transaction"
    ],
    "relatedRoutes": [
      "/transactions",
      "/receipts",
      "/projects/[slug]"
    ]
  },
  {
    "route": "/projects/[slug]/invoices/[invoiceId]/edit",
    "title": "Edit invoice",
    "purpose": "Modify an existing invoice — line items, tax, dates, currency, notes, and payment instructions.",
    "jobsToBeDone": [
      "Add, remove, or edit line items",
      "Change due date or issue date",
      "Add or change tax (VAT, sales tax)",
      "Change the invoice currency",
      "Update notes or payment terms",
      "Save changes, or save & download the updated PDF"
    ],
    "deepLinks": {},
    "reads": [
      "Invoice",
      "InvoiceLineItem",
      "UserPreference"
    ],
    "writes": [
      "Invoice",
      "InvoiceLineItem"
    ],
    "editorContext": "invoice",
    "relatedRoutes": [
      "/settings#invoice-notes-default",
      "/settings#payment-instructions",
      "/projects/[slug]/invoices/[invoiceId]"
    ]
  },
  {
    "route": "/projects/[slug]/invoices/[invoiceId]",
    "title": "Invoice detail",
    "purpose": "View a single invoice — see line items, payment history, and status. Download the PDF to send via your own email (primary flow), or send by email from the overflow menu.",
    "jobsToBeDone": [
      "Review a sent or paid invoice",
      "See the payment history and outstanding balance",
      "Download the invoice PDF and mark it sent (optional: send by email from the overflow menu)",
      "Track status via the Draft → Sent → Paid stepper",
      "Record a payment or link a bank transaction",
      "Void or renegotiate an invoice",
      "Navigate to the edit page to make changes"
    ],
    "deepLinks": {
      "pipeline-breadcrumb": "Pipeline breadcrumb showing quote → invoice chain",
      "history": "Renegotiation history panel (collapsed)",
      "payments": "Payments section with record payment form"
    },
    "reads": [
      "Invoice",
      "InvoiceLineItem",
      "Payment",
      "UserPreference"
    ],
    "writes": [
      "Invoice"
    ],
    "relatedRoutes": [
      "/projects/[slug]/invoices/[invoiceId]/edit",
      "/projects/[slug]/invoices",
      "/settings#payment-instructions"
    ]
  },
  {
    "route": "/projects/[slug]/invoices/new",
    "title": "New invoice",
    "purpose": "Create a new invoice for a client or property project — add line items, set tax, dates, currency, and payment instructions.",
    "jobsToBeDone": [
      "Add line items to a new invoice",
      "Set issue date and due date",
      "Apply tax (VAT, sales tax, etc.)",
      "Set the invoice currency",
      "Add notes and payment instructions",
      "Save a draft, or create & download the PDF to send via your own email",
      "Link the invoice to a specific job"
    ],
    "deepLinks": {},
    "reads": [
      "Workspace",
      "ClientProfile",
      "Job",
      "PropertyProfile",
      "Unit",
      "Lease",
      "Tenant",
      "UserPreference"
    ],
    "writes": [
      "Invoice",
      "InvoiceLineItem"
    ],
    "editorContext": "invoice",
    "relatedRoutes": [
      "/settings#invoice-notes-default",
      "/settings#payment-instructions",
      "/projects/[slug]/invoices"
    ]
  },
  {
    "route": "/projects/[slug]/invoices",
    "title": "Invoices",
    "purpose": "List all invoices for a project — filter by status, see totals, create new invoices.",
    "jobsToBeDone": [
      "See all invoices for a client or property project",
      "Filter invoices by status (draft, sent, paid, overdue, void)",
      "See invoice totals, balances, and AR aging",
      "Create a new invoice for this project",
      "Download an invoice PDF inline (marks it pending-sent for drafts)",
      "Navigate to an invoice detail page"
    ],
    "deepLinks": {},
    "reads": [
      "Invoice",
      "InvoiceLineItem",
      "Payment",
      "Job",
      "UserPreference"
    ],
    "writes": [
      "Invoice"
    ],
    "relatedRoutes": [
      "/projects/[slug]/invoices/new",
      "/settings#invoice-notes-default",
      "/settings#payment-instructions"
    ]
  },
  {
    "route": "/projects/[slug]/jobs/[jobId]",
    "title": "Job detail",
    "purpose": "View a single job — see linked quotes, invoices, work orders, cost margin summary, and manage subcontractor work orders.",
    "jobsToBeDone": [
      "See all invoices and quotes linked to a specific job",
      "View cost vs. revenue margin for this job",
      "Create a new work order for a subcontractor on this job",
      "Add a bill against an existing work order",
      "Change the job status (active, on hold, completed)",
      "See total billed, total cost, and margin percentage"
    ],
    "deepLinks": {},
    "reads": [
      "Job",
      "Invoice",
      "InvoiceLineItem",
      "Quote",
      "WorkOrder",
      "Bill",
      "Vendor"
    ],
    "writes": [
      "Job",
      "WorkOrder",
      "Bill"
    ],
    "relatedRoutes": [
      "/projects/[slug]/jobs",
      "/projects/[slug]/invoices/new",
      "/projects/[slug]/work-orders",
      "/vendors"
    ]
  },
  {
    "route": "/projects/[slug]/jobs",
    "title": "Jobs",
    "purpose": "List all jobs for a client project — see status, billing type, and navigate to job details.",
    "jobsToBeDone": [
      "See all jobs for this client and their status (draft, active, on hold, completed)",
      "Create a new job",
      "Navigate to a job to see its invoices, quotes, and work orders",
      "See billing type for each job (fixed price, time and materials, retainer)"
    ],
    "deepLinks": {},
    "reads": [
      "Job",
      "ClientProfile"
    ],
    "writes": [
      "Job"
    ],
    "relatedRoutes": [
      "/projects/[slug]/jobs/[jobId]",
      "/projects/[slug]/invoices",
      "/projects/[slug]/work-orders"
    ]
  },
  {
    "route": "/projects/[slug]/leases",
    "title": "Leases",
    "purpose": "List all leases for a property — see start/end dates, rent amounts, status, and tenant details.",
    "jobsToBeDone": [
      "See all active, expired, and expiring-soon leases",
      "Check which leases are month-to-month",
      "View rent amount and lease term per lease",
      "Navigate to a unit or tenant from a lease record"
    ],
    "deepLinks": {},
    "reads": [
      "Lease",
      "Tenant",
      "Unit"
    ],
    "writes": [
      "Lease"
    ],
    "relatedRoutes": [
      "/projects/[slug]/units",
      "/projects/[slug]/tenants"
    ]
  },
  {
    "route": "/projects/[slug]/listings",
    "title": "Listings",
    "purpose": "Manage rental listings for vacant units — create, publish, and track applicant enquiries.",
    "jobsToBeDone": [
      "See all active and draft listings for this property",
      "Create a listing for a vacant unit",
      "Edit listing details (description, rent, photos)",
      "See applicant enquiries for a listing",
      "Publish or unpublish a listing"
    ],
    "deepLinks": {},
    "reads": [
      "Listing",
      "PropertyProfile",
      "Unit"
    ],
    "writes": [
      "Listing"
    ],
    "relatedRoutes": [
      "/projects/[slug]/units",
      "/projects/[slug]/tenants"
    ]
  },
  {
    "route": "/projects/[slug]/maintenance/[requestId]",
    "title": "Maintenance request",
    "purpose": "View and manage a single maintenance request — see description, unit, work order, and bills.",
    "jobsToBeDone": [
      "See the full description and priority of a maintenance issue",
      "Assign a vendor and create a work order for this request",
      "Add a bill once the work is completed",
      "Update the request status (open, in-progress, completed)",
      "See which unit the request is associated with"
    ],
    "deepLinks": {},
    "reads": [
      "MaintenanceRequest",
      "Unit",
      "WorkOrder",
      "Bill",
      "Vendor"
    ],
    "writes": [
      "MaintenanceRequest",
      "WorkOrder",
      "Bill"
    ],
    "relatedRoutes": [
      "/projects/[slug]/maintenance",
      "/projects/[slug]/units/[unitId]",
      "/vendors"
    ]
  },
  {
    "route": "/projects/[slug]/maintenance",
    "title": "Maintenance",
    "purpose": "Board view of all maintenance requests for a property — track open, in-progress, and completed requests.",
    "jobsToBeDone": [
      "See all open and in-progress maintenance requests",
      "Check which requests have a work order assigned",
      "Create a new maintenance request",
      "Filter requests by unit or priority",
      "Navigate to a request to see details and assign a vendor"
    ],
    "deepLinks": {},
    "reads": [
      "MaintenanceRequest",
      "Unit",
      "WorkOrder"
    ],
    "writes": [
      "MaintenanceRequest"
    ],
    "relatedRoutes": [
      "/projects/[slug]/maintenance/[requestId]",
      "/projects/[slug]/units",
      "/vendors"
    ]
  },
  {
    "route": "/projects/[slug]/messages/[tenantId]",
    "title": "Tenant conversation",
    "purpose": "Full message thread with a single tenant — send and receive messages.",
    "jobsToBeDone": [
      "Read the full conversation history with a tenant",
      "Send a new message to this tenant",
      "See the tenant's unit and lease context alongside the conversation"
    ],
    "deepLinks": {},
    "reads": [
      "Tenant",
      "Message",
      "Lease",
      "Unit"
    ],
    "writes": [
      "Message"
    ],
    "relatedRoutes": [
      "/projects/[slug]/messages",
      "/projects/[slug]/tenants/[tenantId]"
    ]
  },
  {
    "route": "/projects/[slug]/messages",
    "title": "Messages",
    "purpose": "Inbox of all tenant message threads for a property — see latest messages and navigate to individual conversations.",
    "jobsToBeDone": [
      "See all tenant conversations in one place",
      "Identify which tenants have unread messages",
      "Start a new message thread with a tenant",
      "Navigate to a specific tenant conversation"
    ],
    "deepLinks": {},
    "reads": [
      "Tenant",
      "Message"
    ],
    "writes": [
      "Message"
    ],
    "relatedRoutes": [
      "/projects/[slug]/messages/[tenantId]",
      "/projects/[slug]/tenants"
    ]
  },
  {
    "route": "/projects/[slug]",
    "title": "Project overview",
    "purpose": "Overview page for a single project — CLIENT shows active jobs and client info; PROPERTY shows unit occupancy and rent status.",
    "jobsToBeDone": [
      "See a summary of active jobs and outstanding invoices for a client project",
      "See unit occupancy, rent status, and upcoming lease renewals for a property",
      "Edit client contact details (name, email, phone, company)",
      "Navigate to invoices, quotes, jobs, or work orders for a client project",
      "Navigate to units, leases, tenants, maintenance, or financials for a property"
    ],
    "deepLinks": {},
    "reads": [
      "Workspace",
      "ClientProfile",
      "Job",
      "PropertyProfile",
      "Unit",
      "Lease",
      "Tenant",
      "Invoice",
      "InvoiceLineItem",
      "Payment"
    ],
    "writes": [
      "ClientProfile"
    ],
    "relatedRoutes": [
      "/projects/[slug]/invoices",
      "/projects/[slug]/jobs",
      "/projects/[slug]/units",
      "/projects/[slug]/financials"
    ]
  },
  {
    "route": "/projects/[slug]/quotes/[quoteId]/amend",
    "title": "Quote amendment",
    "purpose": "Create a change order (amendment) to an accepted quote — add or modify line items with adjusted pricing.",
    "jobsToBeDone": [
      "Add change order line items with descriptions, quantities, and prices",
      "Review the amendment total before submitting",
      "Create the amendment and navigate to its detail page"
    ],
    "deepLinks": {},
    "reads": [
      "Quote",
      "QuoteSection",
      "QuoteLineItem"
    ],
    "writes": [
      "Quote",
      "QuoteSection",
      "QuoteLineItem"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes/[quoteId]",
      "/projects/[slug]/quotes"
    ]
  },
  {
    "route": "/projects/[slug]/quotes/[quoteId]/edit",
    "title": "Quote editor",
    "purpose": "Edit a draft quote — modify sections, line items, pricing, terms, costs, and tags.",
    "jobsToBeDone": [
      "Edit quote title, currency, and validity period",
      "Add, remove, or reorder sections and line items",
      "Set item prices, quantities, units, and cost rates",
      "Apply margin rules and tag items for auto-pricing",
      "Review a blended margin percentage",
      "Save draft or save and download the quote PDF"
    ],
    "deepLinks": {},
    "reads": [
      "Quote",
      "QuoteSection",
      "QuoteLineItem",
      "MarginRule"
    ],
    "writes": [
      "Quote",
      "QuoteSection",
      "QuoteLineItem"
    ],
    "editorContext": "quote",
    "relatedRoutes": [
      "/projects/[slug]/quotes/[quoteId]",
      "/projects/[slug]/quotes"
    ]
  },
  {
    "route": "/projects/[slug]/quotes/[quoteId]",
    "title": "Quote detail",
    "purpose": "View a client quote — see sections, line items, pricing, status, and manage signatures or amendments.",
    "jobsToBeDone": [
      "Review quote sections, items, and total pricing",
      "Download the quote PDF and mark it sent (optional: send by email)",
      "Mark a quote as accepted or rejected",
      "Create an amendment to a signed quote",
      "Convert an accepted quote to an invoice",
      "See previous and next versions of this quote"
    ],
    "deepLinks": {
      "pipeline-breadcrumb": "Pipeline breadcrumb showing quote → invoices chain",
      "fulfillment": "Fulfillment bar for accepted quotes (invoicing progress)",
      "amendments": "Amendments list for this quote"
    },
    "reads": [
      "Quote",
      "QuoteSection",
      "QuoteItem",
      "Job",
      "ClientProfile"
    ],
    "writes": [
      "Quote"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes",
      "/projects/[slug]/invoices/new"
    ]
  },
  {
    "route": "/projects/[slug]/quotes/new",
    "title": "New quote",
    "purpose": "Create a new client-facing quote for a client project.",
    "jobsToBeDone": [
      "Start a new quote for a client project",
      "Link the quote to an active job",
      "Set the quote title and initial details"
    ],
    "deepLinks": {},
    "reads": [
      "Job",
      "ClientProfile"
    ],
    "writes": [
      "Quote"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes"
    ]
  },
  {
    "route": "/projects/[slug]/quotes",
    "title": "Quotes",
    "purpose": "List all client-facing quotes for a project — see status, totals, and create new quotes.",
    "jobsToBeDone": [
      "See all quotes and their status (draft, sent, accepted, rejected, superseded)",
      "Check which quotes have been signed or accepted",
      "Create a new quote",
      "Download quote PDFs to send via your own email",
      "Navigate to a quote to view, edit, download, or track it"
    ],
    "deepLinks": {},
    "reads": [
      "Quote",
      "Job",
      "ClientProfile"
    ],
    "writes": [
      "Quote"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes/new",
      "/settings"
    ]
  },
  {
    "route": "/projects/[slug]/tenants/[tenantId]",
    "title": "Tenant detail",
    "purpose": "View a single tenant — contact info, lease history, rent invoice status, and maintenance requests.",
    "jobsToBeDone": [
      "See tenant contact details (name, email, phone)",
      "View the tenant's current and past leases",
      "Check outstanding and paid rent invoices for this tenant",
      "See open maintenance requests submitted by this tenant",
      "Send a message to this tenant",
      "Edit tenant contact information"
    ],
    "deepLinks": {},
    "reads": [
      "Tenant",
      "Lease",
      "Unit",
      "Invoice",
      "InvoiceLineItem",
      "Payment",
      "MaintenanceRequest"
    ],
    "writes": [
      "Tenant",
      "Lease"
    ],
    "relatedRoutes": [
      "/projects/[slug]/tenants",
      "/projects/[slug]/messages/[tenantId]",
      "/projects/[slug]/units/[unitId]"
    ]
  },
  {
    "route": "/projects/[slug]/tenants",
    "title": "Tenants",
    "purpose": "List all tenants for a property — see contact info, unit assignment, and lease status.",
    "jobsToBeDone": [
      "See all tenants and the unit each is assigned to",
      "Check which tenants have active, expiring, or ended leases",
      "Navigate to a tenant detail page",
      "Send a message to a tenant"
    ],
    "deepLinks": {
      "applicant-pipeline": "Applicant pipeline stepper (status + next action)",
      "applicant-docs": "Applicant documents section"
    },
    "reads": [
      "Tenant",
      "Lease",
      "Unit"
    ],
    "writes": [
      "Tenant"
    ],
    "relatedRoutes": [
      "/projects/[slug]/tenants/[tenantId]",
      "/projects/[slug]/messages",
      "/projects/[slug]/units"
    ]
  },
  {
    "route": "/projects/[slug]/time",
    "title": "Time tracking",
    "purpose": "Track billable hours for a client project — log time entries against jobs and see totals.",
    "jobsToBeDone": [
      "Log a new time entry for a job on this project",
      "See total hours logged per job",
      "Edit or delete a time entry",
      "View billable hours ready to invoice"
    ],
    "deepLinks": {},
    "reads": [
      "TimeEntry",
      "Job"
    ],
    "writes": [
      "TimeEntry"
    ],
    "relatedRoutes": [
      "/projects/[slug]/jobs",
      "/projects/[slug]/invoices/new"
    ]
  },
  {
    "route": "/projects/[slug]/units/[unitId]",
    "title": "Unit detail",
    "purpose": "View and manage a single rental unit — lease history, tenant info, rent invoices, maintenance requests, and unit details.",
    "jobsToBeDone": [
      "See the current lease and tenant for this unit",
      "View outstanding and paid rent invoices for this unit",
      "Check open maintenance requests for this unit",
      "Edit unit details (label, bedrooms, rent amount)",
      "Create a new lease for a vacant unit",
      "End a lease or mark it as month-to-month"
    ],
    "deepLinks": {},
    "reads": [
      "Unit",
      "Lease",
      "Tenant",
      "Invoice",
      "InvoiceLineItem",
      "Payment",
      "MaintenanceRequest"
    ],
    "writes": [
      "Unit",
      "Lease"
    ],
    "relatedRoutes": [
      "/projects/[slug]/units",
      "/projects/[slug]/tenants/[tenantId]",
      "/projects/[slug]/maintenance"
    ]
  },
  {
    "route": "/projects/[slug]/units",
    "title": "Units",
    "purpose": "Board view of all rental units in a property — see occupancy, current tenant, rent amount, and lease status.",
    "jobsToBeDone": [
      "See which units are occupied, vacant, or expiring soon",
      "See the current tenant and rent amount per unit",
      "Add a new unit to the property",
      "Navigate to a unit to manage its lease or tenant"
    ],
    "deepLinks": {},
    "reads": [
      "Unit",
      "Lease",
      "Tenant",
      "PropertyProfile"
    ],
    "writes": [
      "Unit"
    ],
    "relatedRoutes": [
      "/projects/[slug]/units/[unitId]",
      "/projects/[slug]/leases",
      "/projects/[slug]/tenants"
    ]
  },
  {
    "route": "/projects/[slug]/work-orders",
    "title": "Work orders",
    "purpose": "List all work orders for a client project — see vendor assignments, agreed costs, bill status, and manage subcontractor work.",
    "jobsToBeDone": [
      "See all work orders for this project and their status",
      "Check which work orders have been billed and which are outstanding",
      "Create a new work order for a subcontractor",
      "Assign or change the vendor on a work order",
      "Add a bill against a completed work order",
      "See the agreed cost and actual billed amount per work order"
    ],
    "deepLinks": {},
    "reads": [
      "WorkOrder",
      "Vendor",
      "Job",
      "Bill"
    ],
    "writes": [
      "WorkOrder",
      "Bill"
    ],
    "relatedRoutes": [
      "/projects/[slug]/jobs/[jobId]",
      "/vendors",
      "/transactions"
    ]
  },
  {
    "route": "/projects/new",
    "title": "New project",
    "purpose": "Create a new workspace — choose type (client, property, or other), name it, and set it up.",
    "jobsToBeDone": [
      "Create a new client project for a freelance client",
      "Create a new property project for a rental property",
      "Create a general other project for tracking miscellaneous expenses",
      "Set the project name and description"
    ],
    "deepLinks": {},
    "reads": [],
    "writes": [
      "Workspace",
      "ClientProfile",
      "PropertyProfile"
    ],
    "relatedRoutes": [
      "/projects",
      "/projects/[slug]"
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
    "purpose": "Manage user preferences, business info, payment methods, invoice templates, and invoice defaults with a live preview.",
    "jobsToBeDone": [
      "Change business name, address, email, phone, VAT number, or website",
      "Add or edit payment methods (bank transfer, PayPal, Stripe, custom)",
      "Set default text for invoice notes and payment instructions",
      "Choose an invoice template (logo placement) and toggle the text business name",
      "Configure margin rules used in quote generation"
    ],
    "deepLinks": {
      "business-name": "#business-name",
      "business-address": "#business-address",
      "invoice-template": "#invoice-template",
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
      "/projects/[slug]/invoices/new"
    ]
  },
  {
    "route": "/setup/work-profile",
    "title": "Set up work profile",
    "purpose": "First-time setup where users describe their work in plain English so AI generates quote templates and a service-item library.",
    "jobsToBeDone": [
      "Describe your profession and services in a few sentences",
      "Generate quote templates and a reusable service-item library from the description",
      "Review generated templates and items before saving",
      "Skip setup and do it later from Settings"
    ],
    "reads": [
      "UserPreference"
    ],
    "writes": [
      "QuoteTemplate",
      "ServiceItem"
    ],
    "deepLinks": {}
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
    "title": "Import transactions",
    "purpose": "Import bank transactions from files or fetch a Chase/N26 CSV through the attended bank-browser assistant, then review and map it before import.",
    "jobsToBeDone": [
      "Drop a CSV file from any bank to import transactions",
      "Fetch a CSV from a supported bank after signing in and confirming the date range",
      "Drop a PDF bank statement to extract and import transactions",
      "Import a CSV or Excel statement with separate money-out and money-in columns",
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
      "/rules"
    ]
  },
  {
    "route": "/vendors/[vendorId]",
    "title": "Vendor detail",
    "purpose": "View a single vendor — contact info, assigned work orders, bills, linked transactions, and uploaded documents.",
    "jobsToBeDone": [
      "See all work orders assigned to this vendor",
      "View bills and payments for this vendor",
      "See transactions linked to this vendor",
      "Upload or view vendor documents (contracts, insurance, etc.)",
      "Edit vendor contact details",
      "Create a new work order for this vendor"
    ],
    "deepLinks": {},
    "reads": [
      "Vendor",
      "Document",
      "WorkOrder",
      "Bill",
      "Transaction"
    ],
    "writes": [
      "Vendor",
      "Document",
      "WorkOrder"
    ],
    "relatedRoutes": [
      "/vendors",
      "/transactions",
      "/projects/[slug]/work-orders"
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
  "account": [
    0,
    1,
    2,
    6,
    40
  ],
  "manually": [
    0,
    2
  ],
  "bank": [
    0,
    1,
    2,
    10,
    35,
    37,
    40,
    41
  ],
  "financial": [
    0,
    1,
    8
  ],
  "type": [
    0,
    3,
    14,
    33,
    34
  ],
  "currency": [
    0,
    1,
    4,
    9,
    11,
    23
  ],
  "country": [
    0
  ],
  "opening": [
    0
  ],
  "balance": [
    0,
    4,
    10
  ],
  "checking": [
    0
  ],
  "savings": [
    0
  ],
  "business": [
    0,
    3,
    37
  ],
  "credit": [
    0
  ],
  "card": [
    0
  ],
  "accounts": [
    0,
    1,
    2,
    4
  ],
  "manage": [
    1,
    2,
    3,
    5,
    13,
    16,
    17,
    24,
    30,
    31,
    32,
    36,
    37,
    43
  ],
  "view": [
    1,
    2,
    7,
    8,
    10,
    13,
    15,
    17,
    18,
    24,
    26,
    27,
    29,
    30,
    31,
    35,
    36,
    42,
    43
  ],
  "balances": [
    1,
    12,
    39
  ],
  "types": [
    1
  ],
  "transaction": [
    1,
    3,
    5,
    6,
    10,
    35,
    40
  ],
  "counts": [
    1,
    5
  ],
  "with": [
    1,
    5,
    17,
    19,
    20,
    22,
    34,
    37,
    41,
    43
  ],
  "current": [
    1,
    27,
    30,
    31
  ],
  "manual": [
    1
  ],
  "what": [
    1
  ],
  "each": [
    1,
    3,
    14,
    28
  ],
  "uses": [
    1
  ],
  "cards": [
    2,
    39
  ],
  "fetch": [
    2,
    41
  ],
  "transactions": [
    2,
    3,
    6,
    8,
    36,
    40,
    41,
    42
  ],
  "from": [
    2,
    3,
    10,
    15,
    38,
    40,
    41
  ],
  "supported": [
    2,
    41
  ],
  "banks": [
    2
  ],
  "remembered": [
    2
  ],
  "browser": [
    2,
    41
  ],
  "data": [
    2,
    6,
    35
  ],
  "latest": [
    2,
    20
  ],
  "chase": [
    2,
    41
  ],
  "forget": [
    2
  ],
  "trusted": [
    2
  ],
  "device": [
    2
  ],
  "profile": [
    2,
    38
  ],
  "learned": [
    2
  ],
  "export": [
    2,
    6
  ],
  "route": [
    2
  ],
  "categories": [
    3,
    4,
    5,
    36
  ],
  "category": [
    3,
    4,
    5,
    6,
    8,
    40
  ],
  "groups": [
    3
  ],
  "rename": [
    3
  ],
  "reorder": [
    3,
    23,
    36
  ],
  "mark": [
    3,
    10,
    24,
    30,
    39
  ],
  "deductible": [
    3
  ],
  "group": [
    3,
    6
  ],
  "delete": [
    3,
    5,
    29,
    35,
    36,
    40
  ],
  "existing": [
    3,
    9,
    13
  ],
  "within": [
    3
  ],
  "excluded": [
    3
  ],
  "reports": [
    3
  ],
  "reset": [
    3
  ],
  "defaults": [
    3,
    37
  ],
  "specific": [
    3,
    7,
    11,
    13,
    20,
    34
  ],
  "many": [
    3
  ],
  "tagged": [
    3
  ],
  "dashboard": [
    4,
    7
  ],
  "overview": [
    4,
    7,
    21,
    39
  ],
  "finances": [
    4
  ],
  "kpis": [
    4
  ],
  "cashflow": [
    4
  ],
  "chart": [
    4
  ],
  "worth": [
    4
  ],
  "expenses": [
    4,
    6,
    8,
    33
  ],
  "income": [
    4,
    5,
    6,
    8
  ],
  "glance": [
    4
  ],
  "over": [
    4
  ],
  "custom": [
    4,
    37
  ],
  "date": [
    4,
    8,
    9,
    11,
    35,
    40,
    41
  ],
  "range": [
    4,
    8,
    41
  ],
  "track": [
    4,
    10,
    16,
    18,
    26,
    29
  ],
  "across": [
    4,
    6,
    7,
    43
  ],
  "expense": [
    4,
    8
  ],
  "period": [
    4,
    6,
    23
  ],
  "switch": [
    4
  ],
  "display": [
    4,
    6
  ],
  "payees": [
    5,
    36
  ],
  "assign": [
    5,
    17,
    18,
    32,
    36
  ],
  "default": [
    5,
    37
  ],
  "vendors": [
    5,
    42,
    43
  ],
  "merchants": [
    5
  ],
  "sources": [
    5
  ],
  "their": [
    5,
    14,
    26,
    32,
    34,
    38,
    43
  ],
  "change": [
    5,
    9,
    13,
    22,
    32,
    37
  ],
  "payee": [
    5,
    6,
    40
  ],
  "search": [
    5,
    40
  ],
  "name": [
    5,
    21,
    27,
    33,
    37
  ],
  "unused": [
    5
  ],
  "pivot": [
    6
  ],
  "table": [
    6
  ],
  "flexible": [
    6
  ],
  "slicing": [
    6
  ],
  "aggregating": [
    6
  ],
  "dimension": [
    6
  ],
  "project": [
    6,
    8,
    11,
    12,
    14,
    21,
    25,
    26,
    29,
    32,
    33,
    34,
    40
  ],
  "time": [
    6,
    14,
    29,
    38
  ],
  "compare": [
    6
  ],
  "different": [
    6
  ],
  "dimensions": [
    6
  ],
  "toggle": [
    6,
    37
  ],
  "subtotals": [
    6
  ],
  "grand": [
    6
  ],
  "totals": [
    6,
    8,
    12,
    26,
    29
  ],
  "decimal": [
    6
  ],
  "save": [
    6,
    9,
    11,
    23
  ],
  "load": [
    6
  ],
  "named": [
    6
  ],
  "presets": [
    6
  ],
  "portfolio": [
    7
  ],
  "property": [
    7,
    11,
    12,
    15,
    16,
    18,
    20,
    21,
    28,
    31,
    33,
    34
  ],
  "showing": [
    7
  ],
  "occupancy": [
    7,
    21,
    31
  ],
  "rates": [
    7,
    23
  ],
  "rent": [
    7,
    15,
    16,
    21,
    27,
    30,
    31
  ],
  "roll": [
    7
  ],
  "maintenance": [
    7,
    17,
    18,
    21,
    27,
    30
  ],
  "properties": [
    7
  ],
  "total": [
    7,
    13,
    22,
    24,
    29,
    43
  ],
  "monthly": [
    7
  ],
  "vacancy": [
    7
  ],
  "loss": [
    7
  ],
  "check": [
    7,
    15,
    18,
    26,
    27,
    28,
    30,
    32
  ],
  "which": [
    7,
    15,
    17,
    18,
    20,
    26,
    28,
    31,
    32,
    36,
    39,
    41
  ],
  "leases": [
    7,
    15,
    21,
    27,
    28
  ],
  "expiring": [
    7,
    15,
    28,
    31
  ],
  "soon": [
    7,
    15,
    31
  ],
  "open": [
    7,
    17,
    18,
    27,
    30
  ],
  "requests": [
    7,
    18,
    27,
    30
  ],
  "navigate": [
    7,
    10,
    12,
    14,
    15,
    18,
    20,
    21,
    22,
    26,
    28,
    31,
    34,
    43
  ],
  "financials": [
    8,
    21
  ],
  "summary": [
    8,
    13,
    21
  ],
  "single": [
    8,
    10,
    13,
    17,
    19,
    21,
    27,
    30,
    42
  ],
  "receipts": [
    8,
    35
  ],
  "categorisation": [
    8,
    36,
    40,
    41
  ],
  "attributed": [
    8
  ],
  "this": [
    8,
    12,
    13,
    14,
    16,
    17,
    19,
    24,
    27,
    29,
    30,
    32,
    42
  ],
  "categorise": [
    8,
    36,
    40
  ],
  "linked": [
    8,
    13,
    42
  ],
  "filter": [
    8,
    12,
    18,
    39,
    40
  ],
  "projects": [
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34
  ],
  "slug": [
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32
  ],
  "edit": [
    9,
    10,
    16,
    21,
    23,
    26,
    27,
    29,
    30,
    35,
    36,
    37,
    40,
    42
  ],
  "invoice": [
    9,
    10,
    11,
    12,
    24,
    27,
    29,
    37,
    39
  ],
  "modify": [
    9,
    22,
    23
  ],
  "line": [
    9,
    10,
    11,
    22,
    23,
    24
  ],
  "items": [
    9,
    10,
    11,
    22,
    23,
    24,
    38
  ],
  "dates": [
    9,
    11,
    15
  ],
  "notes": [
    9,
    11,
    37,
    40
  ],
  "payment": [
    9,
    10,
    11,
    37,
    39,
    43
  ],
  "instructions": [
    9,
    11,
    37
  ],
  "remove": [
    9,
    23
  ],
  "issue": [
    9,
    11,
    17
  ],
  "sales": [
    9,
    11
  ],
  "update": [
    9,
    17
  ],
  "terms": [
    9,
    23
  ],
  "changes": [
    9,
    10
  ],
  "download": [
    9,
    10,
    11,
    12,
    23,
    24,
    26
  ],
  "updated": [
    9
  ],
  "invoices": [
    9,
    10,
    11,
    12,
    13,
    14,
    21,
    27,
    30,
    39
  ],
  "invoiceid": [
    9,
    10
  ],
  "detail": [
    10,
    12,
    13,
    22,
    24,
    27,
    28,
    30,
    34,
    42,
    43
  ],
  "history": [
    10,
    19,
    27,
    30,
    43
  ],
  "status": [
    10,
    12,
    13,
    14,
    15,
    17,
    21,
    24,
    26,
    27,
    28,
    31,
    32,
    39
  ],
  "send": [
    10,
    11,
    19,
    24,
    26,
    27,
    28
  ],
  "your": [
    10,
    11,
    26,
    38
  ],
  "email": [
    10,
    11,
    21,
    24,
    26,
    27,
    37
  ],
  "primary": [
    10
  ],
  "flow": [
    10
  ],
  "overflow": [
    10
  ],
  "menu": [
    10
  ],
  "review": [
    10,
    22,
    23,
    24,
    38,
    41
  ],
  "sent": [
    10,
    12,
    24,
    26,
    39
  ],
  "paid": [
    10,
    12,
    27,
    30,
    43
  ],
  "outstanding": [
    10,
    21,
    27,
    30,
    32,
    39
  ],
  "optional": [
    10,
    24
  ],
  "draft": [
    10,
    11,
    12,
    14,
    16,
    23,
    26,
    39
  ],
  "stepper": [
    10
  ],
  "record": [
    10,
    15
  ],
  "link": [
    10,
    11,
    25,
    35
  ],
  "void": [
    10,
    12
  ],
  "renegotiate": [
    10
  ],
  "page": [
    10,
    12,
    21,
    22,
    28,
    34,
    43
  ],
  "make": [
    10
  ],
  "create": [
    11,
    12,
    13,
    14,
    16,
    17,
    18,
    22,
    24,
    25,
    26,
    30,
    32,
    33,
    34,
    36,
    39,
    40,
    42
  ],
  "client": [
    11,
    12,
    14,
    21,
    24,
    25,
    26,
    29,
    32,
    33,
    34,
    39
  ],
  "apply": [
    11,
    23
  ],
  "list": [
    12,
    14,
    15,
    26,
    28,
    32,
    34
  ],
  "overdue": [
    12,
    39
  ],
  "aging": [
    12
  ],
  "inline": [
    12
  ],
  "marks": [
    12
  ],
  "pending": [
    12
  ],
  "drafts": [
    12
  ],
  "quotes": [
    13,
    14,
    21,
    22,
    23,
    24,
    25,
    26
  ],
  "work": [
    13,
    14,
    17,
    18,
    21,
    32,
    34,
    38,
    39,
    42,
    43
  ],
  "orders": [
    13,
    14,
    21,
    32,
    42,
    43
  ],
  "cost": [
    13,
    23,
    32
  ],
  "margin": [
    13,
    23,
    37
  ],
  "subcontractor": [
    13,
    32,
    34,
    39,
    43
  ],
  "revenue": [
    13
  ],
  "order": [
    13,
    17,
    18,
    22,
    32,
    34,
    39,
    42
  ],
  "bill": [
    13,
    17,
    32,
    34,
    39
  ],
  "against": [
    13,
    29,
    32
  ],
  "active": [
    13,
    14,
    15,
    16,
    21,
    25,
    28
  ],
  "hold": [
    13,
    14
  ],
  "completed": [
    13,
    14,
    17,
    18,
    32
  ],
  "billed": [
    13,
    32
  ],
  "percentage": [
    13,
    23
  ],
  "jobs": [
    13,
    14,
    21,
    29
  ],
  "jobid": [
    13
  ],
  "billing": [
    14
  ],
  "details": [
    14,
    15,
    16,
    18,
    21,
    25,
    27,
    30,
    42
  ],
  "fixed": [
    14
  ],
  "price": [
    14
  ],
  "materials": [
    14
  ],
  "retainer": [
    14
  ],
  "start": [
    15,
    20,
    25
  ],
  "amounts": [
    15,
    39
  ],
  "tenant": [
    15,
    19,
    20,
    27,
    28,
    30,
    31
  ],
  "expired": [
    15
  ],
  "month": [
    15,
    30
  ],
  "amount": [
    15,
    30,
    31,
    32,
    35
  ],
  "lease": [
    15,
    19,
    21,
    27,
    28,
    30,
    31
  ],
  "term": [
    15
  ],
  "unit": [
    15,
    16,
    17,
    18,
    19,
    21,
    28,
    30,
    31
  ],
  "listings": [
    16
  ],
  "rental": [
    16,
    30,
    31,
    33
  ],
  "vacant": [
    16,
    30,
    31
  ],
  "units": [
    16,
    21,
    23,
    30,
    31
  ],
  "publish": [
    16
  ],
  "applicant": [
    16
  ],
  "enquiries": [
    16
  ],
  "listing": [
    16
  ],
  "description": [
    16,
    17,
    33,
    38,
    40
  ],
  "photos": [
    16
  ],
  "unpublish": [
    16
  ],
  "request": [
    17,
    18
  ],
  "bills": [
    17,
    42
  ],
  "full": [
    17,
    19
  ],
  "priority": [
    17,
    18
  ],
  "vendor": [
    17,
    18,
    32,
    35,
    42,
    43
  ],
  "once": [
    17
  ],
  "progress": [
    17,
    18
  ],
  "associated": [
    17
  ],
  "requestid": [
    17
  ],
  "board": [
    18,
    31
  ],
  "have": [
    18,
    20,
    26,
    28,
    32
  ],
  "assigned": [
    18,
    28,
    42
  ],
  "conversation": [
    19,
    20
  ],
  "message": [
    19,
    20,
    27,
    28
  ],
  "thread": [
    19,
    20
  ],
  "receive": [
    19
  ],
  "messages": [
    19,
    20
  ],
  "read": [
    19
  ],
  "context": [
    19
  ],
  "alongside": [
    19
  ],
  "tenantid": [
    19,
    27
  ],
  "inbox": [
    20
  ],
  "threads": [
    20
  ],
  "individual": [
    20
  ],
  "conversations": [
    20
  ],
  "place": [
    20
  ],
  "identify": [
    20
  ],
  "tenants": [
    20,
    21,
    27,
    28
  ],
  "unread": [
    20
  ],
  "shows": [
    21
  ],
  "info": [
    21,
    27,
    28,
    30,
    37,
    42,
    43
  ],
  "upcoming": [
    21
  ],
  "renewals": [
    21
  ],
  "contact": [
    21,
    27,
    28,
    42,
    43
  ],
  "phone": [
    21,
    27,
    37
  ],
  "company": [
    21
  ],
  "quote": [
    22,
    23,
    24,
    25,
    26,
    37,
    38
  ],
  "amendment": [
    22,
    24
  ],
  "accepted": [
    22,
    24,
    26
  ],
  "adjusted": [
    22
  ],
  "pricing": [
    22,
    23,
    24
  ],
  "descriptions": [
    22
  ],
  "quantities": [
    22,
    23
  ],
  "prices": [
    22,
    23
  ],
  "before": [
    22,
    38,
    41
  ],
  "submitting": [
    22
  ],
  "quoteid": [
    22,
    23,
    24
  ],
  "amend": [
    22
  ],
  "editor": [
    23
  ],
  "sections": [
    23,
    24
  ],
  "costs": [
    23,
    32
  ],
  "tags": [
    23
  ],
  "title": [
    23,
    25
  ],
  "validity": [
    23
  ],
  "item": [
    23,
    38
  ],
  "rules": [
    23,
    36,
    37,
    41
  ],
  "auto": [
    23,
    36
  ],
  "blended": [
    23
  ],
  "signatures": [
    24
  ],
  "amendments": [
    24
  ],
  "rejected": [
    24,
    26
  ],
  "signed": [
    24,
    26
  ],
  "convert": [
    24
  ],
  "previous": [
    24
  ],
  "next": [
    24
  ],
  "versions": [
    24
  ],
  "facing": [
    25,
    26
  ],
  "initial": [
    25
  ],
  "superseded": [
    26
  ],
  "been": [
    26,
    32
  ],
  "pdfs": [
    26
  ],
  "past": [
    27
  ],
  "submitted": [
    27
  ],
  "information": [
    27
  ],
  "assignment": [
    28
  ],
  "ended": [
    28
  ],
  "tracking": [
    29,
    33
  ],
  "billable": [
    29
  ],
  "hours": [
    29
  ],
  "entries": [
    29
  ],
  "entry": [
    29
  ],
  "logged": [
    29
  ],
  "ready": [
    29
  ],
  "label": [
    30
  ],
  "bedrooms": [
    30
  ],
  "unitid": [
    30
  ],
  "occupied": [
    31
  ],
  "assignments": [
    32
  ],
  "agreed": [
    32
  ],
  "actual": [
    32
  ],
  "workspace": [
    33
  ],
  "choose": [
    33,
    37
  ],
  "other": [
    33,
    34
  ],
  "freelance": [
    33,
    34,
    39
  ],
  "general": [
    33
  ],
  "miscellaneous": [
    33
  ],
  "workspaces": [
    34
  ],
  "creation": [
    34
  ],
  "shortcuts": [
    34
  ],
  "intake": [
    34,
    39
  ],
  "upload": [
    35,
    41,
    42
  ],
  "automatically": [
    35
  ],
  "extracts": [
    35
  ],
  "receipt": [
    35
  ],
  "image": [
    35
  ],
  "processing": [
    35
  ],
  "extracted": [
    35
  ],
  "matching": [
    35
  ],
  "retry": [
    35
  ],
  "failed": [
    35
  ],
  "records": [
    35
  ],
  "that": [
    36
  ],
  "import": [
    36,
    41
  ],
  "accept": [
    36
  ],
  "suggested": [
    36
  ],
  "agent": [
    36
  ],
  "generate": [
    36,
    38
  ],
  "suggestions": [
    36,
    41
  ],
  "settings": [
    37,
    38
  ],
  "user": [
    37
  ],
  "preferences": [
    37
  ],
  "methods": [
    37
  ],
  "templates": [
    37,
    38
  ],
  "live": [
    37
  ],
  "preview": [
    37,
    41
  ],
  "address": [
    37
  ],
  "number": [
    37
  ],
  "website": [
    37
  ],
  "transfer": [
    37
  ],
  "paypal": [
    37
  ],
  "stripe": [
    37
  ],
  "text": [
    37
  ],
  "template": [
    37
  ],
  "logo": [
    37
  ],
  "placement": [
    37
  ],
  "configure": [
    37
  ],
  "used": [
    37
  ],
  "generation": [
    37
  ],
  "first": [
    38
  ],
  "setup": [
    38
  ],
  "where": [
    38
  ],
  "users": [
    38
  ],
  "describe": [
    38
  ],
  "plain": [
    38
  ],
  "english": [
    38
  ],
  "generates": [
    38
  ],
  "service": [
    38
  ],
  "library": [
    38
  ],
  "profession": [
    38
  ],
  "services": [
    38
  ],
  "sentences": [
    38
  ],
  "reusable": [
    38
  ],
  "generated": [
    38
  ],
  "saving": [
    38
  ],
  "skip": [
    38
  ],
  "later": [
    38
  ],
  "clients": [
    39
  ],
  "quick": [
    39
  ],
  "actions": [
    39
  ],
  "money": [
    39,
    41
  ],
  "unsent": [
    39
  ],
  "collected": [
    39
  ],
  "studio": [
    39
  ],
  "browse": [
    40
  ],
  "bulk": [
    40
  ],
  "duplicate": [
    40
  ],
  "unwanted": [
    40
  ],
  "rule": [
    40
  ],
  "edited": [
    40
  ],
  "files": [
    41
  ],
  "through": [
    41
  ],
  "attended": [
    41
  ],
  "assistant": [
    41
  ],
  "then": [
    41
  ],
  "drop": [
    41
  ],
  "file": [
    41
  ],
  "after": [
    41
  ],
  "signing": [
    41
  ],
  "confirming": [
    41
  ],
  "statement": [
    41
  ],
  "extract": [
    41
  ],
  "excel": [
    41
  ],
  "separate": [
    41
  ],
  "columns": [
    41
  ],
  "right": [
    41
  ],
  "fields": [
    41
  ],
  "will": [
    41
  ],
  "imported": [
    41
  ],
  "duplicates": [
    41
  ],
  "trigger": [
    41
  ],
  "automatic": [
    41
  ],
  "uploaded": [
    42
  ],
  "documents": [
    42,
    43
  ],
  "payments": [
    42
  ],
  "contracts": [
    42
  ],
  "insurance": [
    42
  ],
  "vendorid": [
    42
  ],
  "subcontractors": [
    43
  ]
}
