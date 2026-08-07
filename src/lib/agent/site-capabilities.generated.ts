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
      "/bank-sync"
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
      "/bank-sync"
    ]
  },
  {
    "route": "/bank-accounts",
    "title": "Bank accounts",
    "purpose": "View and manage all bank accounts and cards — manual sync via browser agent.",
    "jobsToBeDone": [
      "See all bank accounts and cards",
      "Add a new bank account manually",
      "Connect a bank account via browser automation (manual sync)"
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
      "/bank-sync",
      "/transactions"
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
      "/transactions",
      "/accounts"
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
      "Save changes or send the updated invoice"
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
    "purpose": "View a single invoice — see line items, payment history, status, and download or send options.",
    "jobsToBeDone": [
      "Review a sent or paid invoice",
      "See the payment history and outstanding balance",
      "Download the invoice as a PDF",
      "Send or resend the invoice by email",
      "Mark an invoice as sent or paid manually",
      "Void an invoice",
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
      "Save a draft or send the invoice immediately",
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
      "See invoice totals and payment summaries",
      "Create a new invoice for this project",
      "Navigate to an invoice detail or edit page",
      "Download or send an invoice by email"
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
      "Save draft or save and send the quote to the client"
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
      "Send the quote to the client by email",
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
      "/projects/[slug]/quotes",
      "/projects/[slug]/quotes/[quoteId]/generate"
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
      "Navigate to a quote to view, edit, or send it"
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
    "purpose": "Import bank transactions from a CSV file or PDF statement with AI-assisted column mapping.",
    "jobsToBeDone": [
      "Drop a CSV file from any bank to import transactions",
      "Drop a PDF bank statement to extract and import transactions",
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
    3,
    7,
    40
  ],
  "manually": [
    0,
    2,
    3,
    11
  ],
  "bank": [
    0,
    1,
    2,
    3,
    36,
    38,
    40,
    41
  ],
  "financial": [
    0,
    1,
    9
  ],
  "type": [
    0,
    4,
    15,
    34,
    35
  ],
  "currency": [
    0,
    1,
    5,
    10,
    12,
    24
  ],
  "country": [
    0
  ],
  "opening": [
    0
  ],
  "balance": [
    0,
    5,
    11
  ],
  "checking": [
    0
  ],
  "savings": [
    0
  ],
  "business": [
    0,
    4,
    38
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
    3,
    5
  ],
  "manage": [
    1,
    2,
    4,
    6,
    14,
    17,
    18,
    25,
    31,
    32,
    33,
    37,
    38,
    43
  ],
  "view": [
    1,
    2,
    8,
    9,
    11,
    14,
    16,
    18,
    19,
    25,
    27,
    28,
    30,
    31,
    32,
    36,
    37,
    42,
    43
  ],
  "balances": [
    1,
    39
  ],
  "types": [
    1
  ],
  "transaction": [
    1,
    4,
    6,
    7,
    36,
    40
  ],
  "counts": [
    1,
    6
  ],
  "with": [
    1,
    6,
    18,
    20,
    21,
    23,
    35,
    38,
    41,
    43
  ],
  "current": [
    1,
    28,
    31,
    32
  ],
  "manual": [
    1,
    2,
    3
  ],
  "what": [
    1
  ],
  "each": [
    1,
    4,
    15,
    29
  ],
  "uses": [
    1
  ],
  "cards": [
    2,
    39
  ],
  "sync": [
    2,
    3
  ],
  "browser": [
    2
  ],
  "agent": [
    2,
    37
  ],
  "connect": [
    2
  ],
  "automation": [
    2
  ],
  "trigger": [
    3,
    41
  ],
  "connected": [
    3
  ],
  "pull": [
    3
  ],
  "latest": [
    3,
    21
  ],
  "transactions": [
    3,
    4,
    7,
    9,
    37,
    40,
    41,
    42
  ],
  "when": [
    3
  ],
  "last": [
    3
  ],
  "many": [
    3,
    4
  ],
  "were": [
    3
  ],
  "imported": [
    3,
    41
  ],
  "check": [
    3,
    8,
    16,
    19,
    27,
    28,
    29,
    31,
    33
  ],
  "status": [
    3,
    11,
    13,
    14,
    15,
    16,
    18,
    22,
    25,
    27,
    28,
    29,
    32,
    33,
    39
  ],
  "running": [
    3
  ],
  "categories": [
    4,
    5,
    6,
    37
  ],
  "category": [
    4,
    5,
    6,
    7,
    9,
    40
  ],
  "groups": [
    4
  ],
  "rename": [
    4
  ],
  "reorder": [
    4,
    24,
    37
  ],
  "mark": [
    4,
    11,
    25,
    31,
    39
  ],
  "deductible": [
    4
  ],
  "group": [
    4,
    7
  ],
  "delete": [
    4,
    6,
    30,
    36,
    37,
    40
  ],
  "existing": [
    4,
    10,
    14
  ],
  "within": [
    4
  ],
  "excluded": [
    4
  ],
  "from": [
    4,
    16,
    40,
    41
  ],
  "reports": [
    4
  ],
  "reset": [
    4
  ],
  "defaults": [
    4,
    38
  ],
  "specific": [
    4,
    8,
    12,
    14,
    21,
    35
  ],
  "tagged": [
    4
  ],
  "dashboard": [
    5,
    8
  ],
  "overview": [
    5,
    8,
    22,
    39
  ],
  "finances": [
    5
  ],
  "kpis": [
    5
  ],
  "cashflow": [
    5
  ],
  "chart": [
    5
  ],
  "worth": [
    5
  ],
  "expenses": [
    5,
    7,
    9,
    34
  ],
  "income": [
    5,
    6,
    7,
    9
  ],
  "glance": [
    5
  ],
  "over": [
    5
  ],
  "custom": [
    5,
    38
  ],
  "date": [
    5,
    9,
    10,
    12,
    36,
    40
  ],
  "range": [
    5,
    9
  ],
  "track": [
    5,
    17,
    19,
    30
  ],
  "across": [
    5,
    7,
    8,
    43
  ],
  "expense": [
    5,
    9
  ],
  "period": [
    5,
    7,
    24
  ],
  "switch": [
    5
  ],
  "display": [
    5,
    7
  ],
  "payees": [
    6,
    37
  ],
  "assign": [
    6,
    18,
    19,
    33,
    37
  ],
  "default": [
    6,
    38
  ],
  "vendors": [
    6,
    42,
    43
  ],
  "merchants": [
    6
  ],
  "sources": [
    6
  ],
  "their": [
    6,
    15,
    27,
    33,
    35,
    43
  ],
  "change": [
    6,
    10,
    14,
    23,
    33,
    38
  ],
  "payee": [
    6,
    7,
    40
  ],
  "search": [
    6,
    40
  ],
  "name": [
    6,
    22,
    28,
    34,
    38
  ],
  "unused": [
    6
  ],
  "pivot": [
    7
  ],
  "table": [
    7
  ],
  "flexible": [
    7
  ],
  "slicing": [
    7
  ],
  "aggregating": [
    7
  ],
  "data": [
    7,
    36
  ],
  "dimension": [
    7
  ],
  "project": [
    7,
    9,
    12,
    13,
    15,
    22,
    26,
    27,
    30,
    33,
    34,
    35,
    40
  ],
  "time": [
    7,
    15,
    30
  ],
  "compare": [
    7
  ],
  "different": [
    7
  ],
  "dimensions": [
    7
  ],
  "toggle": [
    7,
    38
  ],
  "subtotals": [
    7
  ],
  "grand": [
    7
  ],
  "totals": [
    7,
    9,
    13,
    27,
    30
  ],
  "decimal": [
    7
  ],
  "export": [
    7
  ],
  "save": [
    7,
    10,
    12,
    24
  ],
  "load": [
    7
  ],
  "named": [
    7
  ],
  "presets": [
    7
  ],
  "portfolio": [
    8
  ],
  "property": [
    8,
    12,
    13,
    16,
    17,
    19,
    21,
    22,
    29,
    32,
    34,
    35
  ],
  "showing": [
    8
  ],
  "occupancy": [
    8,
    22,
    32
  ],
  "rates": [
    8,
    24
  ],
  "rent": [
    8,
    16,
    17,
    22,
    28,
    31,
    32
  ],
  "roll": [
    8
  ],
  "maintenance": [
    8,
    18,
    19,
    22,
    28,
    31
  ],
  "properties": [
    8
  ],
  "total": [
    8,
    14,
    23,
    25,
    30,
    43
  ],
  "monthly": [
    8
  ],
  "vacancy": [
    8
  ],
  "loss": [
    8
  ],
  "which": [
    8,
    16,
    18,
    19,
    21,
    27,
    29,
    32,
    33,
    37,
    39,
    41
  ],
  "leases": [
    8,
    16,
    22,
    28,
    29
  ],
  "expiring": [
    8,
    16,
    29,
    32
  ],
  "soon": [
    8,
    16,
    32
  ],
  "open": [
    8,
    18,
    19,
    28,
    31
  ],
  "requests": [
    8,
    19,
    28,
    31
  ],
  "navigate": [
    8,
    11,
    13,
    15,
    16,
    19,
    21,
    22,
    23,
    27,
    29,
    32,
    35,
    43
  ],
  "financials": [
    9,
    22
  ],
  "summary": [
    9,
    14,
    22
  ],
  "single": [
    9,
    11,
    14,
    18,
    20,
    22,
    28,
    31,
    42
  ],
  "receipts": [
    9,
    36
  ],
  "categorisation": [
    9,
    37,
    40,
    41
  ],
  "attributed": [
    9
  ],
  "this": [
    9,
    13,
    14,
    15,
    17,
    18,
    20,
    25,
    28,
    30,
    31,
    33,
    42
  ],
  "categorise": [
    9,
    37,
    40
  ],
  "linked": [
    9,
    14,
    42
  ],
  "filter": [
    9,
    13,
    19,
    39,
    40
  ],
  "projects": [
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
    34,
    35
  ],
  "slug": [
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
    33
  ],
  "edit": [
    10,
    11,
    13,
    17,
    22,
    24,
    27,
    28,
    30,
    31,
    36,
    37,
    38,
    40,
    42
  ],
  "invoice": [
    10,
    11,
    12,
    13,
    25,
    28,
    30,
    38,
    39
  ],
  "modify": [
    10,
    23,
    24
  ],
  "line": [
    10,
    11,
    12,
    23,
    24,
    25
  ],
  "items": [
    10,
    11,
    12,
    23,
    24,
    25
  ],
  "dates": [
    10,
    12,
    16
  ],
  "notes": [
    10,
    12,
    38,
    40
  ],
  "payment": [
    10,
    11,
    12,
    13,
    38,
    39,
    43
  ],
  "instructions": [
    10,
    12,
    38
  ],
  "remove": [
    10,
    24
  ],
  "issue": [
    10,
    12,
    18
  ],
  "sales": [
    10,
    12
  ],
  "update": [
    10,
    18
  ],
  "terms": [
    10,
    24
  ],
  "changes": [
    10,
    11
  ],
  "send": [
    10,
    11,
    12,
    13,
    20,
    24,
    25,
    27,
    28,
    29
  ],
  "updated": [
    10
  ],
  "invoices": [
    10,
    11,
    12,
    13,
    14,
    15,
    22,
    28,
    31,
    39
  ],
  "invoiceid": [
    10,
    11
  ],
  "detail": [
    11,
    13,
    14,
    23,
    25,
    28,
    29,
    31,
    35,
    42,
    43
  ],
  "history": [
    11,
    20,
    28,
    31,
    43
  ],
  "download": [
    11,
    13
  ],
  "options": [
    11
  ],
  "review": [
    11,
    23,
    24,
    25
  ],
  "sent": [
    11,
    13,
    27,
    39
  ],
  "paid": [
    11,
    13,
    28,
    31,
    43
  ],
  "outstanding": [
    11,
    22,
    28,
    31,
    33,
    39
  ],
  "resend": [
    11
  ],
  "email": [
    11,
    13,
    22,
    25,
    28,
    38
  ],
  "void": [
    11,
    13
  ],
  "page": [
    11,
    13,
    22,
    23,
    29,
    35,
    43
  ],
  "make": [
    11
  ],
  "create": [
    12,
    13,
    14,
    15,
    17,
    18,
    19,
    23,
    25,
    26,
    27,
    31,
    33,
    34,
    35,
    37,
    39,
    40,
    42
  ],
  "client": [
    12,
    13,
    15,
    22,
    24,
    25,
    26,
    27,
    30,
    33,
    34,
    35,
    39
  ],
  "apply": [
    12,
    24
  ],
  "draft": [
    12,
    13,
    15,
    17,
    24,
    27,
    39
  ],
  "immediately": [
    12
  ],
  "link": [
    12,
    26,
    36
  ],
  "list": [
    13,
    15,
    16,
    27,
    29,
    33,
    35
  ],
  "overdue": [
    13,
    39
  ],
  "summaries": [
    13
  ],
  "quotes": [
    14,
    15,
    22,
    23,
    24,
    25,
    26,
    27
  ],
  "work": [
    14,
    15,
    18,
    19,
    22,
    33,
    35,
    39,
    42,
    43
  ],
  "orders": [
    14,
    15,
    22,
    33,
    42,
    43
  ],
  "cost": [
    14,
    24,
    33
  ],
  "margin": [
    14,
    24,
    38
  ],
  "subcontractor": [
    14,
    33,
    35,
    39,
    43
  ],
  "revenue": [
    14
  ],
  "order": [
    14,
    18,
    19,
    23,
    33,
    35,
    39,
    42
  ],
  "bill": [
    14,
    18,
    33,
    35,
    39
  ],
  "against": [
    14,
    30,
    33
  ],
  "active": [
    14,
    15,
    16,
    17,
    22,
    26,
    29
  ],
  "hold": [
    14,
    15
  ],
  "completed": [
    14,
    15,
    18,
    19,
    33
  ],
  "billed": [
    14,
    33
  ],
  "percentage": [
    14,
    24
  ],
  "jobs": [
    14,
    15,
    22,
    30
  ],
  "jobid": [
    14
  ],
  "billing": [
    15
  ],
  "details": [
    15,
    16,
    17,
    19,
    22,
    26,
    28,
    31,
    42
  ],
  "fixed": [
    15
  ],
  "price": [
    15
  ],
  "materials": [
    15
  ],
  "retainer": [
    15
  ],
  "start": [
    16,
    21,
    26
  ],
  "amounts": [
    16,
    39
  ],
  "tenant": [
    16,
    20,
    21,
    28,
    29,
    31,
    32
  ],
  "expired": [
    16
  ],
  "month": [
    16,
    31
  ],
  "amount": [
    16,
    31,
    32,
    33,
    36
  ],
  "lease": [
    16,
    20,
    22,
    28,
    29,
    31,
    32
  ],
  "term": [
    16
  ],
  "unit": [
    16,
    17,
    18,
    19,
    20,
    22,
    29,
    31,
    32
  ],
  "record": [
    16
  ],
  "listings": [
    17
  ],
  "rental": [
    17,
    31,
    32,
    34
  ],
  "vacant": [
    17,
    31,
    32
  ],
  "units": [
    17,
    22,
    24,
    31,
    32
  ],
  "publish": [
    17
  ],
  "applicant": [
    17
  ],
  "enquiries": [
    17
  ],
  "listing": [
    17
  ],
  "description": [
    17,
    18,
    34,
    40
  ],
  "photos": [
    17
  ],
  "unpublish": [
    17
  ],
  "request": [
    18,
    19
  ],
  "bills": [
    18,
    42
  ],
  "full": [
    18,
    20
  ],
  "priority": [
    18,
    19
  ],
  "vendor": [
    18,
    19,
    33,
    36,
    42,
    43
  ],
  "once": [
    18
  ],
  "progress": [
    18,
    19
  ],
  "associated": [
    18
  ],
  "requestid": [
    18
  ],
  "board": [
    19,
    32
  ],
  "have": [
    19,
    21,
    27,
    29,
    33
  ],
  "assigned": [
    19,
    29,
    42
  ],
  "conversation": [
    20,
    21
  ],
  "message": [
    20,
    21,
    28,
    29
  ],
  "thread": [
    20,
    21
  ],
  "receive": [
    20
  ],
  "messages": [
    20,
    21
  ],
  "read": [
    20
  ],
  "context": [
    20
  ],
  "alongside": [
    20
  ],
  "tenantid": [
    20,
    28
  ],
  "inbox": [
    21
  ],
  "threads": [
    21
  ],
  "individual": [
    21
  ],
  "conversations": [
    21
  ],
  "place": [
    21
  ],
  "identify": [
    21
  ],
  "tenants": [
    21,
    22,
    28,
    29
  ],
  "unread": [
    21
  ],
  "shows": [
    22
  ],
  "info": [
    22,
    28,
    29,
    31,
    38,
    42,
    43
  ],
  "upcoming": [
    22
  ],
  "renewals": [
    22
  ],
  "contact": [
    22,
    28,
    29,
    42,
    43
  ],
  "phone": [
    22,
    28,
    38
  ],
  "company": [
    22
  ],
  "quote": [
    23,
    24,
    25,
    26,
    27,
    38
  ],
  "amendment": [
    23,
    25
  ],
  "accepted": [
    23,
    25,
    27
  ],
  "adjusted": [
    23
  ],
  "pricing": [
    23,
    24,
    25
  ],
  "descriptions": [
    23
  ],
  "quantities": [
    23,
    24
  ],
  "prices": [
    23,
    24
  ],
  "before": [
    23
  ],
  "submitting": [
    23
  ],
  "quoteid": [
    23,
    24,
    25
  ],
  "amend": [
    23
  ],
  "editor": [
    24
  ],
  "sections": [
    24,
    25
  ],
  "costs": [
    24,
    33
  ],
  "tags": [
    24
  ],
  "title": [
    24,
    26
  ],
  "validity": [
    24
  ],
  "item": [
    24
  ],
  "rules": [
    24,
    37,
    38,
    41
  ],
  "auto": [
    24,
    37
  ],
  "blended": [
    24
  ],
  "signatures": [
    25
  ],
  "amendments": [
    25
  ],
  "rejected": [
    25,
    27
  ],
  "signed": [
    25,
    27
  ],
  "convert": [
    25
  ],
  "previous": [
    25
  ],
  "next": [
    25
  ],
  "versions": [
    25
  ],
  "facing": [
    26,
    27
  ],
  "initial": [
    26
  ],
  "superseded": [
    27
  ],
  "been": [
    27,
    33
  ],
  "past": [
    28
  ],
  "submitted": [
    28
  ],
  "information": [
    28
  ],
  "assignment": [
    29
  ],
  "ended": [
    29
  ],
  "tracking": [
    30,
    34
  ],
  "billable": [
    30
  ],
  "hours": [
    30
  ],
  "entries": [
    30
  ],
  "entry": [
    30
  ],
  "logged": [
    30
  ],
  "ready": [
    30
  ],
  "label": [
    31
  ],
  "bedrooms": [
    31
  ],
  "unitid": [
    31
  ],
  "occupied": [
    32
  ],
  "assignments": [
    33
  ],
  "agreed": [
    33
  ],
  "actual": [
    33
  ],
  "workspace": [
    34
  ],
  "choose": [
    34,
    38
  ],
  "other": [
    34,
    35
  ],
  "freelance": [
    34,
    35,
    39
  ],
  "general": [
    34
  ],
  "miscellaneous": [
    34
  ],
  "workspaces": [
    35
  ],
  "creation": [
    35
  ],
  "shortcuts": [
    35
  ],
  "intake": [
    35,
    39
  ],
  "upload": [
    36,
    41,
    42
  ],
  "automatically": [
    36
  ],
  "extracts": [
    36
  ],
  "receipt": [
    36
  ],
  "image": [
    36
  ],
  "processing": [
    36
  ],
  "extracted": [
    36
  ],
  "matching": [
    36
  ],
  "retry": [
    36
  ],
  "failed": [
    36
  ],
  "records": [
    36
  ],
  "that": [
    37
  ],
  "import": [
    37,
    41
  ],
  "accept": [
    37
  ],
  "suggested": [
    37
  ],
  "generate": [
    37
  ],
  "suggestions": [
    37,
    41
  ],
  "settings": [
    38
  ],
  "user": [
    38
  ],
  "preferences": [
    38
  ],
  "methods": [
    38
  ],
  "templates": [
    38
  ],
  "live": [
    38
  ],
  "preview": [
    38,
    41
  ],
  "address": [
    38
  ],
  "number": [
    38
  ],
  "website": [
    38
  ],
  "transfer": [
    38
  ],
  "paypal": [
    38
  ],
  "stripe": [
    38
  ],
  "text": [
    38
  ],
  "template": [
    38
  ],
  "logo": [
    38
  ],
  "placement": [
    38
  ],
  "configure": [
    38
  ],
  "used": [
    38
  ],
  "generation": [
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
    39
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
  "file": [
    41
  ],
  "statement": [
    41
  ],
  "assisted": [
    41
  ],
  "column": [
    41
  ],
  "mapping": [
    41
  ],
  "drop": [
    41
  ],
  "extract": [
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
  "duplicates": [
    41
  ],
  "automatic": [
    41
  ],
  "after": [
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
