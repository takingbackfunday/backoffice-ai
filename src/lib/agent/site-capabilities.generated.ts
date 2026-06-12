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
    "route": "/projects/[slug]/estimates/[estId]",
    "title": "Edit estimate",
    "purpose": "View and edit an existing cost estimate — modify sections, line items, hours, quantities, and cost rates.",
    "jobsToBeDone": [
      "Add, remove, or edit estimate sections and line items",
      "Update hours, quantities, and cost rates",
      "Change estimate status to final",
      "Link the estimate to a job",
      "Use this estimate as the basis for a quote"
    ],
    "deepLinks": {
      "pipeline-breadcrumb": "Pipeline breadcrumb showing estimate → quotes",
      "versions": "Estimate version chain panel"
    },
    "reads": [
      "Estimate",
      "EstimateSection",
      "EstimateItem",
      "Job"
    ],
    "writes": [
      "Estimate",
      "EstimateSection",
      "EstimateItem"
    ],
    "editorContext": "estimate",
    "relatedRoutes": [
      "/projects/[slug]/estimates",
      "/projects/[slug]/quotes/new"
    ]
  },
  {
    "route": "/projects/[slug]/estimates/new",
    "title": "New estimate",
    "purpose": "Create a new cost estimate — add sections and line items with hours, quantities, and cost rates.",
    "jobsToBeDone": [
      "Add sections and line items to a new estimate",
      "Set hours, quantities, and cost rates per item",
      "Link the estimate to an active job",
      "Save the estimate as a draft"
    ],
    "deepLinks": {},
    "reads": [
      "Workspace",
      "ClientProfile",
      "Job"
    ],
    "writes": [
      "Estimate",
      "EstimateSection",
      "EstimateItem"
    ],
    "editorContext": "estimate",
    "relatedRoutes": [
      "/projects/[slug]/estimates",
      "/projects/[slug]/quotes/new"
    ]
  },
  {
    "route": "/projects/[slug]/estimates",
    "title": "Estimates",
    "purpose": "List all cost estimates for a client project — view status, cost totals, and create new estimates.",
    "jobsToBeDone": [
      "See all estimates for a project and their status (draft, final, superseded)",
      "View cost totals per estimate",
      "Create a new estimate",
      "Navigate to an estimate to view or edit it"
    ],
    "deepLinks": {},
    "reads": [
      "Estimate",
      "EstimateSection",
      "EstimateItem"
    ],
    "writes": [
      "Estimate"
    ],
    "relatedRoutes": [
      "/projects/[slug]/estimates/new",
      "/projects/[slug]/quotes"
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
      "pipeline-breadcrumb": "Pipeline breadcrumb showing estimate → quote → invoice chain",
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
      "Navigate to invoices, estimates, quotes, jobs, or work orders for a client project",
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
    "route": "/projects/[slug]/quotes/[quoteId]/generate",
    "title": "Generate quote",
    "purpose": "Review and finalise quote line items from an estimate before sending to the client — set margins, review totals, and confirm pricing.",
    "jobsToBeDone": [
      "Review estimate line items and set sell prices or margins",
      "See cost vs sell price to check profitability before sending",
      "Edit estimate sections and items inline while reviewing the quote",
      "Finalise and generate the quote ready to send"
    ],
    "deepLinks": {},
    "reads": [
      "Quote",
      "QuoteSection",
      "QuoteItem",
      "Estimate",
      "EstimateSection",
      "EstimateItem"
    ],
    "writes": [
      "Quote",
      "QuoteSection",
      "QuoteItem"
    ],
    "editorContext": "quote",
    "relatedRoutes": [
      "/projects/[slug]/quotes/[quoteId]",
      "/settings"
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
      "pipeline-breadcrumb": "Pipeline breadcrumb showing estimate → quote → invoices chain",
      "fulfillment": "Fulfillment bar for accepted quotes (invoicing progress)",
      "amendments": "Amendments list for this quote"
    },
    "reads": [
      "Quote",
      "QuoteSection",
      "QuoteItem",
      "Estimate",
      "Job",
      "ClientProfile"
    ],
    "writes": [
      "Quote"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes/[quoteId]/generate",
      "/projects/[slug]/invoices/new",
      "/projects/[slug]/quotes"
    ]
  },
  {
    "route": "/projects/[slug]/quotes/new",
    "title": "New quote",
    "purpose": "Create a new client-facing quote, optionally linked to a job or estimate.",
    "jobsToBeDone": [
      "Start a new quote for a client project",
      "Link the quote to an active job",
      "Base the quote on an existing estimate",
      "Set the quote title and initial details"
    ],
    "deepLinks": {},
    "reads": [
      "Job",
      "Estimate",
      "ClientProfile"
    ],
    "writes": [
      "Quote"
    ],
    "relatedRoutes": [
      "/projects/[slug]/quotes",
      "/projects/[slug]/quotes/[quoteId]/generate",
      "/projects/[slug]/estimates"
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
      "/projects/[slug]/estimates",
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
    42
  ],
  "manually": [
    0,
    2,
    3,
    14
  ],
  "bank": [
    0,
    1,
    2,
    3,
    38,
    40,
    42,
    43
  ],
  "financial": [
    0,
    1,
    12
  ],
  "type": [
    0,
    4,
    18,
    36,
    37
  ],
  "currency": [
    0,
    1,
    5,
    13,
    15
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
    14
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
    40
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
    17,
    20,
    21,
    27,
    33,
    34,
    35,
    39,
    40,
    45
  ],
  "view": [
    1,
    2,
    8,
    9,
    11,
    12,
    14,
    17,
    19,
    21,
    22,
    27,
    29,
    30,
    32,
    33,
    34,
    38,
    39,
    44,
    45
  ],
  "balances": [
    1,
    41
  ],
  "types": [
    1
  ],
  "transaction": [
    1,
    4,
    6,
    7,
    38,
    42
  ],
  "counts": [
    1,
    6
  ],
  "with": [
    1,
    6,
    10,
    21,
    23,
    24,
    37,
    43,
    45
  ],
  "current": [
    1,
    30,
    33,
    34
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
    18,
    31
  ],
  "uses": [
    1
  ],
  "cards": [
    2,
    41
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
    39
  ],
  "connect": [
    2
  ],
  "automation": [
    2
  ],
  "trigger": [
    3,
    43
  ],
  "connected": [
    3
  ],
  "pull": [
    3
  ],
  "latest": [
    3,
    24
  ],
  "transactions": [
    3,
    4,
    7,
    12,
    39,
    42,
    43,
    44
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
    43
  ],
  "check": [
    3,
    8,
    19,
    22,
    26,
    29,
    30,
    31,
    33,
    35
  ],
  "status": [
    3,
    9,
    11,
    14,
    16,
    17,
    18,
    19,
    21,
    25,
    27,
    29,
    30,
    31,
    34,
    35,
    41
  ],
  "running": [
    3
  ],
  "categories": [
    4,
    5,
    6,
    39
  ],
  "category": [
    4,
    5,
    6,
    7,
    12,
    42
  ],
  "groups": [
    4
  ],
  "rename": [
    4
  ],
  "reorder": [
    4,
    39
  ],
  "mark": [
    4,
    14,
    27,
    33,
    41
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
    32,
    38,
    39,
    42
  ],
  "existing": [
    4,
    9,
    13,
    17,
    28
  ],
  "within": [
    4
  ],
  "excluded": [
    4
  ],
  "from": [
    4,
    19,
    26,
    42,
    43
  ],
  "reports": [
    4
  ],
  "reset": [
    4
  ],
  "defaults": [
    4,
    40
  ],
  "specific": [
    4,
    8,
    15,
    17,
    24,
    37
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
    25,
    41
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
    12,
    36
  ],
  "income": [
    5,
    6,
    7,
    12
  ],
  "glance": [
    5
  ],
  "over": [
    5
  ],
  "custom": [
    5,
    40
  ],
  "date": [
    5,
    12,
    13,
    15,
    38,
    42
  ],
  "range": [
    5,
    12
  ],
  "track": [
    5,
    20,
    22,
    32
  ],
  "across": [
    5,
    7,
    8,
    45
  ],
  "expense": [
    5,
    12
  ],
  "period": [
    5,
    7
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
    39
  ],
  "assign": [
    6,
    21,
    22,
    35,
    39
  ],
  "default": [
    6,
    40
  ],
  "vendors": [
    6,
    44,
    45
  ],
  "merchants": [
    6
  ],
  "sources": [
    6
  ],
  "their": [
    6,
    11,
    18,
    29,
    35,
    37,
    45
  ],
  "change": [
    6,
    9,
    13,
    17,
    35,
    40
  ],
  "payee": [
    6,
    7,
    42
  ],
  "search": [
    6,
    42
  ],
  "name": [
    6,
    25,
    30,
    36,
    40
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
    38
  ],
  "dimension": [
    7
  ],
  "project": [
    7,
    11,
    12,
    15,
    16,
    18,
    25,
    28,
    29,
    32,
    35,
    36,
    37,
    42
  ],
  "time": [
    7,
    18,
    32
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
    7
  ],
  "subtotals": [
    7
  ],
  "grand": [
    7
  ],
  "totals": [
    7,
    11,
    12,
    16,
    26,
    29,
    32
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
    13,
    15
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
    15,
    16,
    19,
    20,
    22,
    24,
    25,
    31,
    34,
    36,
    37
  ],
  "showing": [
    8
  ],
  "occupancy": [
    8,
    25,
    34
  ],
  "rates": [
    8,
    9,
    10
  ],
  "rent": [
    8,
    19,
    20,
    25,
    30,
    33,
    34
  ],
  "roll": [
    8
  ],
  "maintenance": [
    8,
    21,
    22,
    25,
    30,
    33
  ],
  "properties": [
    8
  ],
  "total": [
    8,
    17,
    27,
    32,
    45
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
    19,
    21,
    22,
    24,
    29,
    31,
    34,
    35,
    39,
    41,
    43
  ],
  "leases": [
    8,
    19,
    25,
    30,
    31
  ],
  "expiring": [
    8,
    19,
    31,
    34
  ],
  "soon": [
    8,
    19,
    34
  ],
  "open": [
    8,
    21,
    22,
    30,
    33
  ],
  "requests": [
    8,
    22,
    30,
    33
  ],
  "navigate": [
    8,
    11,
    14,
    16,
    18,
    19,
    22,
    24,
    25,
    29,
    31,
    34,
    37,
    45
  ],
  "edit": [
    9,
    11,
    13,
    14,
    16,
    20,
    25,
    26,
    29,
    30,
    32,
    33,
    38,
    39,
    40,
    42,
    44
  ],
  "estimate": [
    9,
    10,
    11,
    26,
    28
  ],
  "cost": [
    9,
    10,
    11,
    17,
    26,
    35
  ],
  "modify": [
    9,
    13
  ],
  "sections": [
    9,
    10,
    26,
    27
  ],
  "line": [
    9,
    10,
    13,
    14,
    15,
    26,
    27
  ],
  "items": [
    9,
    10,
    13,
    14,
    15,
    26,
    27
  ],
  "hours": [
    9,
    10,
    32
  ],
  "quantities": [
    9,
    10
  ],
  "remove": [
    9,
    13
  ],
  "update": [
    9,
    13,
    21
  ],
  "final": [
    9,
    11
  ],
  "link": [
    9,
    10,
    15,
    28,
    38
  ],
  "this": [
    9,
    12,
    16,
    17,
    18,
    20,
    21,
    23,
    27,
    30,
    32,
    33,
    35,
    44
  ],
  "basis": [
    9
  ],
  "quote": [
    9,
    26,
    27,
    28,
    29,
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
    35,
    36,
    37
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
    33,
    34,
    35
  ],
  "estimates": [
    9,
    10,
    11,
    25
  ],
  "estid": [
    9
  ],
  "create": [
    10,
    11,
    15,
    16,
    17,
    18,
    20,
    21,
    22,
    27,
    28,
    29,
    33,
    35,
    36,
    37,
    39,
    41,
    42,
    44
  ],
  "item": [
    10
  ],
  "active": [
    10,
    17,
    18,
    19,
    20,
    25,
    28,
    31
  ],
  "draft": [
    10,
    11,
    15,
    16,
    18,
    20,
    29,
    41
  ],
  "list": [
    11,
    16,
    18,
    19,
    29,
    31,
    35,
    37
  ],
  "client": [
    11,
    15,
    16,
    18,
    25,
    26,
    27,
    28,
    29,
    32,
    35,
    36,
    37,
    41
  ],
  "superseded": [
    11,
    29
  ],
  "financials": [
    12,
    25
  ],
  "summary": [
    12,
    17,
    25
  ],
  "single": [
    12,
    14,
    17,
    21,
    23,
    25,
    30,
    33,
    44
  ],
  "receipts": [
    12,
    38
  ],
  "categorisation": [
    12,
    39,
    42,
    43
  ],
  "attributed": [
    12
  ],
  "categorise": [
    12,
    39,
    42
  ],
  "linked": [
    12,
    17,
    28,
    44
  ],
  "filter": [
    12,
    16,
    22,
    41,
    42
  ],
  "invoice": [
    13,
    14,
    15,
    16,
    27,
    30,
    32,
    40,
    41
  ],
  "dates": [
    13,
    15,
    19
  ],
  "notes": [
    13,
    15,
    40,
    42
  ],
  "payment": [
    13,
    14,
    15,
    16,
    40,
    41,
    45
  ],
  "instructions": [
    13,
    15,
    40
  ],
  "issue": [
    13,
    15,
    21
  ],
  "sales": [
    13,
    15
  ],
  "terms": [
    13
  ],
  "changes": [
    13,
    14
  ],
  "send": [
    13,
    14,
    15,
    16,
    23,
    26,
    27,
    29,
    30,
    31
  ],
  "updated": [
    13
  ],
  "invoices": [
    13,
    14,
    15,
    16,
    17,
    18,
    25,
    30,
    33,
    41
  ],
  "invoiceid": [
    13,
    14
  ],
  "detail": [
    14,
    16,
    17,
    27,
    30,
    31,
    33,
    37,
    44,
    45
  ],
  "history": [
    14,
    23,
    30,
    33,
    45
  ],
  "download": [
    14,
    16
  ],
  "options": [
    14
  ],
  "review": [
    14,
    26,
    27
  ],
  "sent": [
    14,
    16,
    29,
    41
  ],
  "paid": [
    14,
    16,
    30,
    33,
    45
  ],
  "outstanding": [
    14,
    25,
    30,
    33,
    35,
    41
  ],
  "resend": [
    14
  ],
  "email": [
    14,
    16,
    25,
    27,
    30,
    40
  ],
  "void": [
    14,
    16
  ],
  "page": [
    14,
    16,
    25,
    31,
    37,
    45
  ],
  "make": [
    14
  ],
  "apply": [
    15
  ],
  "immediately": [
    15
  ],
  "overdue": [
    16,
    41
  ],
  "summaries": [
    16
  ],
  "quotes": [
    17,
    18,
    25,
    26,
    27,
    28,
    29
  ],
  "work": [
    17,
    18,
    21,
    22,
    25,
    35,
    37,
    41,
    44,
    45
  ],
  "orders": [
    17,
    18,
    25,
    35,
    44,
    45
  ],
  "margin": [
    17,
    40
  ],
  "subcontractor": [
    17,
    35,
    37,
    41,
    45
  ],
  "revenue": [
    17
  ],
  "order": [
    17,
    21,
    22,
    35,
    37,
    41,
    44
  ],
  "bill": [
    17,
    21,
    35,
    37,
    41
  ],
  "against": [
    17,
    32,
    35
  ],
  "hold": [
    17,
    18
  ],
  "completed": [
    17,
    18,
    21,
    22,
    35
  ],
  "billed": [
    17,
    35
  ],
  "percentage": [
    17
  ],
  "jobs": [
    17,
    18,
    25,
    32
  ],
  "jobid": [
    17
  ],
  "billing": [
    18
  ],
  "details": [
    18,
    19,
    20,
    22,
    25,
    28,
    30,
    33,
    44
  ],
  "fixed": [
    18
  ],
  "price": [
    18,
    26
  ],
  "materials": [
    18
  ],
  "retainer": [
    18
  ],
  "start": [
    19,
    24,
    28
  ],
  "amounts": [
    19,
    41
  ],
  "tenant": [
    19,
    23,
    24,
    30,
    31,
    33,
    34
  ],
  "expired": [
    19
  ],
  "month": [
    19,
    33
  ],
  "amount": [
    19,
    33,
    34,
    35,
    38
  ],
  "lease": [
    19,
    23,
    25,
    30,
    31,
    33,
    34
  ],
  "term": [
    19
  ],
  "unit": [
    19,
    20,
    21,
    22,
    23,
    25,
    31,
    33,
    34
  ],
  "record": [
    19
  ],
  "listings": [
    20
  ],
  "rental": [
    20,
    33,
    34,
    36
  ],
  "vacant": [
    20,
    33,
    34
  ],
  "units": [
    20,
    25,
    33,
    34
  ],
  "publish": [
    20
  ],
  "applicant": [
    20
  ],
  "enquiries": [
    20
  ],
  "listing": [
    20
  ],
  "description": [
    20,
    21,
    36,
    42
  ],
  "photos": [
    20
  ],
  "unpublish": [
    20
  ],
  "request": [
    21,
    22
  ],
  "bills": [
    21,
    44
  ],
  "full": [
    21,
    23
  ],
  "priority": [
    21,
    22
  ],
  "vendor": [
    21,
    22,
    35,
    38,
    44,
    45
  ],
  "once": [
    21
  ],
  "progress": [
    21,
    22
  ],
  "associated": [
    21
  ],
  "requestid": [
    21
  ],
  "board": [
    22,
    34
  ],
  "have": [
    22,
    24,
    29,
    31,
    35
  ],
  "assigned": [
    22,
    31,
    44
  ],
  "conversation": [
    23,
    24
  ],
  "message": [
    23,
    24,
    30,
    31
  ],
  "thread": [
    23,
    24
  ],
  "receive": [
    23
  ],
  "messages": [
    23,
    24
  ],
  "read": [
    23
  ],
  "context": [
    23
  ],
  "alongside": [
    23
  ],
  "tenantid": [
    23,
    30
  ],
  "inbox": [
    24
  ],
  "threads": [
    24
  ],
  "individual": [
    24
  ],
  "conversations": [
    24
  ],
  "place": [
    24
  ],
  "identify": [
    24
  ],
  "tenants": [
    24,
    25,
    30,
    31
  ],
  "unread": [
    24
  ],
  "shows": [
    25
  ],
  "info": [
    25,
    30,
    31,
    33,
    40,
    44,
    45
  ],
  "upcoming": [
    25
  ],
  "renewals": [
    25
  ],
  "contact": [
    25,
    30,
    31,
    44,
    45
  ],
  "phone": [
    25,
    30,
    40
  ],
  "company": [
    25
  ],
  "generate": [
    26,
    39
  ],
  "finalise": [
    26
  ],
  "before": [
    26
  ],
  "sending": [
    26
  ],
  "margins": [
    26
  ],
  "confirm": [
    26
  ],
  "pricing": [
    26,
    27
  ],
  "sell": [
    26
  ],
  "prices": [
    26
  ],
  "profitability": [
    26
  ],
  "inline": [
    26
  ],
  "while": [
    26
  ],
  "reviewing": [
    26
  ],
  "ready": [
    26,
    32
  ],
  "quoteid": [
    26,
    27
  ],
  "signatures": [
    27
  ],
  "amendments": [
    27
  ],
  "accepted": [
    27,
    29
  ],
  "rejected": [
    27,
    29
  ],
  "amendment": [
    27
  ],
  "signed": [
    27,
    29
  ],
  "convert": [
    27
  ],
  "previous": [
    27
  ],
  "next": [
    27
  ],
  "versions": [
    27
  ],
  "facing": [
    28,
    29
  ],
  "optionally": [
    28
  ],
  "base": [
    28
  ],
  "title": [
    28
  ],
  "initial": [
    28
  ],
  "been": [
    29,
    35
  ],
  "past": [
    30
  ],
  "submitted": [
    30
  ],
  "information": [
    30
  ],
  "assignment": [
    31
  ],
  "ended": [
    31
  ],
  "tracking": [
    32,
    36
  ],
  "billable": [
    32
  ],
  "entries": [
    32
  ],
  "entry": [
    32
  ],
  "logged": [
    32
  ],
  "label": [
    33
  ],
  "bedrooms": [
    33
  ],
  "unitid": [
    33
  ],
  "occupied": [
    34
  ],
  "assignments": [
    35
  ],
  "agreed": [
    35
  ],
  "costs": [
    35
  ],
  "actual": [
    35
  ],
  "workspace": [
    36
  ],
  "choose": [
    36
  ],
  "other": [
    36,
    37
  ],
  "freelance": [
    36,
    37,
    41
  ],
  "general": [
    36
  ],
  "miscellaneous": [
    36
  ],
  "workspaces": [
    37
  ],
  "creation": [
    37
  ],
  "shortcuts": [
    37
  ],
  "intake": [
    37,
    41
  ],
  "upload": [
    38,
    43,
    44
  ],
  "automatically": [
    38
  ],
  "extracts": [
    38
  ],
  "receipt": [
    38
  ],
  "image": [
    38
  ],
  "processing": [
    38
  ],
  "extracted": [
    38
  ],
  "matching": [
    38
  ],
  "retry": [
    38
  ],
  "failed": [
    38
  ],
  "records": [
    38
  ],
  "rules": [
    39,
    40,
    43
  ],
  "that": [
    39
  ],
  "auto": [
    39
  ],
  "import": [
    39,
    43
  ],
  "accept": [
    39
  ],
  "suggested": [
    39
  ],
  "suggestions": [
    39,
    43
  ],
  "settings": [
    40
  ],
  "user": [
    40
  ],
  "preferences": [
    40
  ],
  "methods": [
    40
  ],
  "address": [
    40
  ],
  "number": [
    40
  ],
  "website": [
    40
  ],
  "transfer": [
    40
  ],
  "paypal": [
    40
  ],
  "stripe": [
    40
  ],
  "text": [
    40
  ],
  "configure": [
    40
  ],
  "used": [
    40
  ],
  "generation": [
    40
  ],
  "clients": [
    41
  ],
  "quick": [
    41
  ],
  "actions": [
    41
  ],
  "money": [
    41
  ],
  "unsent": [
    41
  ],
  "collected": [
    41
  ],
  "studio": [
    41
  ],
  "browse": [
    42
  ],
  "bulk": [
    42
  ],
  "duplicate": [
    42
  ],
  "unwanted": [
    42
  ],
  "rule": [
    42
  ],
  "edited": [
    42
  ],
  "file": [
    43
  ],
  "assisted": [
    43
  ],
  "column": [
    43
  ],
  "mapping": [
    43
  ],
  "drop": [
    43
  ],
  "columns": [
    43
  ],
  "right": [
    43
  ],
  "fields": [
    43
  ],
  "preview": [
    43
  ],
  "will": [
    43
  ],
  "duplicates": [
    43
  ],
  "automatic": [
    43
  ],
  "after": [
    43
  ],
  "uploaded": [
    44
  ],
  "documents": [
    44,
    45
  ],
  "payments": [
    44
  ],
  "contracts": [
    44
  ],
  "insurance": [
    44
  ],
  "vendorid": [
    44
  ],
  "subcontractors": [
    45
  ]
}
