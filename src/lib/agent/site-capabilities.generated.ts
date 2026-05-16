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
      "Set an opening balance",
      "Link the account to an existing bank connection"
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
      "/connections",
      "/bank-sync"
    ]
  },
  {
    "route": "/bank-accounts",
    "title": "Bank accounts",
    "purpose": "View and manage all connected and manually added bank accounts — sync status, balances, and connection health.",
    "jobsToBeDone": [
      "See all bank accounts and their current balance",
      "Check the sync status of each connected account",
      "Add a new bank account manually",
      "Connect a bank account via open banking (Plaid, Finexer, Enable Banking)",
      "Reconnect a disconnected bank account",
      "Refresh transactions for a connected account"
    ],
    "deepLinks": {},
    "reads": [
      "Account",
      "Institution",
      "BankConnection"
    ],
    "writes": [
      "Account",
      "BankConnection"
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
      "/connections",
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
    "deepLinks": {},
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
    "deepLinks": {},
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
    "deepLinks": {},
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
    "deepLinks": {},
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
      "/connections",
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
    5,
    8,
    43
  ],
  "manually": [
    0,
    2,
    3,
    15
  ],
  "bank": [
    0,
    1,
    2,
    3,
    5,
    39,
    41,
    43,
    44
  ],
  "financial": [
    0,
    1,
    13
  ],
  "type": [
    0,
    4,
    19,
    37,
    38
  ],
  "currency": [
    0,
    1,
    6,
    14,
    16
  ],
  "country": [
    0
  ],
  "opening": [
    0
  ],
  "balance": [
    0,
    2,
    6,
    15
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
    41
  ],
  "credit": [
    0
  ],
  "card": [
    0
  ],
  "link": [
    0,
    10,
    11,
    16,
    29,
    39
  ],
  "existing": [
    0,
    4,
    5,
    10,
    14,
    18,
    29
  ],
  "connection": [
    0,
    2,
    5
  ],
  "accounts": [
    0,
    1,
    2,
    3,
    5,
    6
  ],
  "manage": [
    1,
    2,
    4,
    7,
    18,
    21,
    22,
    28,
    34,
    35,
    36,
    40,
    41,
    46
  ],
  "view": [
    1,
    2,
    5,
    9,
    10,
    12,
    13,
    15,
    18,
    20,
    22,
    23,
    28,
    30,
    31,
    33,
    34,
    35,
    39,
    40,
    45,
    46
  ],
  "balances": [
    1,
    2,
    42
  ],
  "types": [
    1
  ],
  "transaction": [
    1,
    4,
    5,
    7,
    8,
    39,
    43
  ],
  "counts": [
    1,
    7
  ],
  "with": [
    1,
    7,
    11,
    22,
    24,
    25,
    38,
    44,
    46
  ],
  "current": [
    1,
    2,
    31,
    34,
    35
  ],
  "manual": [
    1,
    3
  ],
  "what": [
    1
  ],
  "each": [
    1,
    2,
    4,
    19,
    32
  ],
  "uses": [
    1
  ],
  "connected": [
    2,
    3
  ],
  "added": [
    2
  ],
  "sync": [
    2,
    3,
    5
  ],
  "status": [
    2,
    3,
    5,
    10,
    12,
    15,
    17,
    18,
    19,
    20,
    22,
    26,
    28,
    30,
    31,
    32,
    35,
    36,
    42
  ],
  "health": [
    2
  ],
  "their": [
    2,
    7,
    12,
    19,
    30,
    36,
    38,
    46
  ],
  "check": [
    2,
    3,
    9,
    20,
    23,
    27,
    30,
    31,
    32,
    34,
    36
  ],
  "connect": [
    2,
    5
  ],
  "open": [
    2,
    9,
    22,
    23,
    31,
    34
  ],
  "banking": [
    2,
    5
  ],
  "plaid": [
    2,
    5
  ],
  "finexer": [
    2,
    5
  ],
  "enable": [
    2,
    5
  ],
  "reconnect": [
    2
  ],
  "disconnected": [
    2
  ],
  "refresh": [
    2,
    5
  ],
  "transactions": [
    2,
    3,
    4,
    8,
    13,
    40,
    43,
    44,
    45
  ],
  "trigger": [
    3,
    44
  ],
  "pull": [
    3
  ],
  "latest": [
    3,
    25
  ],
  "when": [
    3
  ],
  "last": [
    3,
    5
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
    44
  ],
  "running": [
    3
  ],
  "categories": [
    4,
    6,
    7,
    40
  ],
  "category": [
    4,
    6,
    7,
    8,
    13,
    43
  ],
  "groups": [
    4
  ],
  "rename": [
    4
  ],
  "reorder": [
    4,
    40
  ],
  "mark": [
    4,
    15,
    28,
    34,
    42
  ],
  "deductible": [
    4
  ],
  "group": [
    4,
    8
  ],
  "delete": [
    4,
    7,
    33,
    39,
    40,
    43
  ],
  "within": [
    4
  ],
  "excluded": [
    4
  ],
  "from": [
    4,
    20,
    27,
    43,
    44
  ],
  "reports": [
    4
  ],
  "reset": [
    4
  ],
  "defaults": [
    4,
    41
  ],
  "specific": [
    4,
    9,
    16,
    18,
    25,
    38
  ],
  "tagged": [
    4
  ],
  "connections": [
    5
  ],
  "automatic": [
    5,
    44
  ],
  "european": [
    5
  ],
  "countries": [
    5
  ],
  "disconnect": [
    5
  ],
  "time": [
    5,
    8,
    19,
    33
  ],
  "dashboard": [
    6,
    9
  ],
  "overview": [
    6,
    9,
    26,
    42
  ],
  "finances": [
    6
  ],
  "kpis": [
    6
  ],
  "cashflow": [
    6
  ],
  "chart": [
    6
  ],
  "worth": [
    6
  ],
  "expenses": [
    6,
    8,
    13,
    37
  ],
  "income": [
    6,
    7,
    8,
    13
  ],
  "glance": [
    6
  ],
  "over": [
    6
  ],
  "custom": [
    6,
    41
  ],
  "date": [
    6,
    13,
    14,
    16,
    39,
    43
  ],
  "range": [
    6,
    13
  ],
  "track": [
    6,
    21,
    23,
    33
  ],
  "across": [
    6,
    8,
    9,
    46
  ],
  "expense": [
    6,
    13
  ],
  "period": [
    6,
    8
  ],
  "switch": [
    6
  ],
  "display": [
    6,
    8
  ],
  "payees": [
    7,
    40
  ],
  "assign": [
    7,
    22,
    23,
    36,
    40
  ],
  "default": [
    7,
    41
  ],
  "vendors": [
    7,
    45,
    46
  ],
  "merchants": [
    7
  ],
  "sources": [
    7
  ],
  "change": [
    7,
    10,
    14,
    18,
    36,
    41
  ],
  "payee": [
    7,
    8,
    43
  ],
  "search": [
    7,
    43
  ],
  "name": [
    7,
    26,
    31,
    37,
    41
  ],
  "unused": [
    7
  ],
  "pivot": [
    8
  ],
  "table": [
    8
  ],
  "flexible": [
    8
  ],
  "slicing": [
    8
  ],
  "aggregating": [
    8
  ],
  "data": [
    8,
    39
  ],
  "dimension": [
    8
  ],
  "project": [
    8,
    12,
    13,
    16,
    17,
    19,
    26,
    29,
    30,
    33,
    36,
    37,
    38,
    43
  ],
  "compare": [
    8
  ],
  "different": [
    8
  ],
  "dimensions": [
    8
  ],
  "toggle": [
    8
  ],
  "subtotals": [
    8
  ],
  "grand": [
    8
  ],
  "totals": [
    8,
    12,
    13,
    17,
    27,
    30,
    33
  ],
  "decimal": [
    8
  ],
  "export": [
    8
  ],
  "save": [
    8,
    11,
    14,
    16
  ],
  "load": [
    8
  ],
  "named": [
    8
  ],
  "presets": [
    8
  ],
  "portfolio": [
    9
  ],
  "property": [
    9,
    16,
    17,
    20,
    21,
    23,
    25,
    26,
    32,
    35,
    37,
    38
  ],
  "showing": [
    9
  ],
  "occupancy": [
    9,
    26,
    35
  ],
  "rates": [
    9,
    10,
    11
  ],
  "rent": [
    9,
    20,
    21,
    26,
    31,
    34,
    35
  ],
  "roll": [
    9
  ],
  "maintenance": [
    9,
    22,
    23,
    26,
    31,
    34
  ],
  "properties": [
    9
  ],
  "total": [
    9,
    18,
    28,
    33,
    46
  ],
  "monthly": [
    9
  ],
  "vacancy": [
    9
  ],
  "loss": [
    9
  ],
  "which": [
    9,
    20,
    22,
    23,
    25,
    30,
    32,
    35,
    36,
    40,
    42,
    44
  ],
  "leases": [
    9,
    20,
    26,
    31,
    32
  ],
  "expiring": [
    9,
    20,
    32,
    35
  ],
  "soon": [
    9,
    20,
    35
  ],
  "requests": [
    9,
    23,
    31,
    34
  ],
  "navigate": [
    9,
    12,
    15,
    17,
    19,
    20,
    23,
    25,
    26,
    30,
    32,
    35,
    38,
    46
  ],
  "edit": [
    10,
    12,
    14,
    15,
    17,
    21,
    26,
    27,
    30,
    31,
    33,
    34,
    39,
    40,
    41,
    43,
    45
  ],
  "estimate": [
    10,
    11,
    12,
    27,
    29
  ],
  "cost": [
    10,
    11,
    12,
    18,
    27,
    36
  ],
  "modify": [
    10,
    14
  ],
  "sections": [
    10,
    11,
    27,
    28
  ],
  "line": [
    10,
    11,
    14,
    15,
    16,
    27,
    28
  ],
  "items": [
    10,
    11,
    14,
    15,
    16,
    27,
    28
  ],
  "hours": [
    10,
    11,
    33
  ],
  "quantities": [
    10,
    11
  ],
  "remove": [
    10,
    14
  ],
  "update": [
    10,
    14,
    22
  ],
  "final": [
    10,
    12
  ],
  "this": [
    10,
    13,
    17,
    18,
    19,
    21,
    22,
    24,
    28,
    31,
    33,
    34,
    36,
    45
  ],
  "basis": [
    10
  ],
  "quote": [
    10,
    27,
    28,
    29,
    30,
    41
  ],
  "projects": [
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
    37,
    38
  ],
  "slug": [
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
    36
  ],
  "estimates": [
    10,
    11,
    12,
    26
  ],
  "estid": [
    10
  ],
  "create": [
    11,
    12,
    16,
    17,
    18,
    19,
    21,
    22,
    23,
    28,
    29,
    30,
    34,
    36,
    37,
    38,
    40,
    42,
    43,
    45
  ],
  "item": [
    11
  ],
  "active": [
    11,
    18,
    19,
    20,
    21,
    26,
    29,
    32
  ],
  "draft": [
    11,
    12,
    16,
    17,
    19,
    21,
    30,
    42
  ],
  "list": [
    12,
    17,
    19,
    20,
    30,
    32,
    36,
    38
  ],
  "client": [
    12,
    16,
    17,
    19,
    26,
    27,
    28,
    29,
    30,
    33,
    36,
    37,
    38,
    42
  ],
  "superseded": [
    12,
    30
  ],
  "financials": [
    13,
    26
  ],
  "summary": [
    13,
    18,
    26
  ],
  "single": [
    13,
    15,
    18,
    22,
    24,
    26,
    31,
    34,
    45
  ],
  "receipts": [
    13,
    39
  ],
  "categorisation": [
    13,
    40,
    43,
    44
  ],
  "attributed": [
    13
  ],
  "categorise": [
    13,
    40,
    43
  ],
  "linked": [
    13,
    18,
    29,
    45
  ],
  "filter": [
    13,
    17,
    23,
    42,
    43
  ],
  "invoice": [
    14,
    15,
    16,
    17,
    28,
    31,
    33,
    41,
    42
  ],
  "dates": [
    14,
    16,
    20
  ],
  "notes": [
    14,
    16,
    41,
    43
  ],
  "payment": [
    14,
    15,
    16,
    17,
    41,
    42,
    46
  ],
  "instructions": [
    14,
    16,
    41
  ],
  "issue": [
    14,
    16,
    22
  ],
  "sales": [
    14,
    16
  ],
  "terms": [
    14
  ],
  "changes": [
    14,
    15
  ],
  "send": [
    14,
    15,
    16,
    17,
    24,
    27,
    28,
    30,
    31,
    32
  ],
  "updated": [
    14
  ],
  "invoices": [
    14,
    15,
    16,
    17,
    18,
    19,
    26,
    31,
    34,
    42
  ],
  "invoiceid": [
    14,
    15
  ],
  "detail": [
    15,
    17,
    18,
    28,
    31,
    32,
    34,
    38,
    45,
    46
  ],
  "history": [
    15,
    24,
    31,
    34,
    46
  ],
  "download": [
    15,
    17
  ],
  "options": [
    15
  ],
  "review": [
    15,
    27,
    28
  ],
  "sent": [
    15,
    17,
    30,
    42
  ],
  "paid": [
    15,
    17,
    31,
    34,
    46
  ],
  "outstanding": [
    15,
    26,
    31,
    34,
    36,
    42
  ],
  "resend": [
    15
  ],
  "email": [
    15,
    17,
    26,
    28,
    31,
    41
  ],
  "void": [
    15,
    17
  ],
  "page": [
    15,
    17,
    26,
    32,
    38,
    46
  ],
  "make": [
    15
  ],
  "apply": [
    16
  ],
  "immediately": [
    16
  ],
  "overdue": [
    17,
    42
  ],
  "summaries": [
    17
  ],
  "quotes": [
    18,
    19,
    26,
    27,
    28,
    29,
    30
  ],
  "work": [
    18,
    19,
    22,
    23,
    26,
    36,
    38,
    42,
    45,
    46
  ],
  "orders": [
    18,
    19,
    26,
    36,
    45,
    46
  ],
  "margin": [
    18,
    41
  ],
  "subcontractor": [
    18,
    36,
    38,
    42,
    46
  ],
  "revenue": [
    18
  ],
  "order": [
    18,
    22,
    23,
    36,
    38,
    42,
    45
  ],
  "bill": [
    18,
    22,
    36,
    38,
    42
  ],
  "against": [
    18,
    33,
    36
  ],
  "hold": [
    18,
    19
  ],
  "completed": [
    18,
    19,
    22,
    23,
    36
  ],
  "billed": [
    18,
    36
  ],
  "percentage": [
    18
  ],
  "jobs": [
    18,
    19,
    26,
    33
  ],
  "jobid": [
    18
  ],
  "billing": [
    19
  ],
  "details": [
    19,
    20,
    21,
    23,
    26,
    29,
    31,
    34,
    45
  ],
  "fixed": [
    19
  ],
  "price": [
    19,
    27
  ],
  "materials": [
    19
  ],
  "retainer": [
    19
  ],
  "start": [
    20,
    25,
    29
  ],
  "amounts": [
    20,
    42
  ],
  "tenant": [
    20,
    24,
    25,
    31,
    32,
    34,
    35
  ],
  "expired": [
    20
  ],
  "month": [
    20,
    34
  ],
  "amount": [
    20,
    34,
    35,
    36,
    39
  ],
  "lease": [
    20,
    24,
    26,
    31,
    32,
    34,
    35
  ],
  "term": [
    20
  ],
  "unit": [
    20,
    21,
    22,
    23,
    24,
    26,
    32,
    34,
    35
  ],
  "record": [
    20
  ],
  "listings": [
    21
  ],
  "rental": [
    21,
    34,
    35,
    37
  ],
  "vacant": [
    21,
    34,
    35
  ],
  "units": [
    21,
    26,
    34,
    35
  ],
  "publish": [
    21
  ],
  "applicant": [
    21
  ],
  "enquiries": [
    21
  ],
  "listing": [
    21
  ],
  "description": [
    21,
    22,
    37,
    43
  ],
  "photos": [
    21
  ],
  "unpublish": [
    21
  ],
  "request": [
    22,
    23
  ],
  "bills": [
    22,
    45
  ],
  "full": [
    22,
    24
  ],
  "priority": [
    22,
    23
  ],
  "vendor": [
    22,
    23,
    36,
    39,
    45,
    46
  ],
  "once": [
    22
  ],
  "progress": [
    22,
    23
  ],
  "associated": [
    22
  ],
  "requestid": [
    22
  ],
  "board": [
    23,
    35
  ],
  "have": [
    23,
    25,
    30,
    32,
    36
  ],
  "assigned": [
    23,
    32,
    45
  ],
  "conversation": [
    24,
    25
  ],
  "message": [
    24,
    25,
    31,
    32
  ],
  "thread": [
    24,
    25
  ],
  "receive": [
    24
  ],
  "messages": [
    24,
    25
  ],
  "read": [
    24
  ],
  "context": [
    24
  ],
  "alongside": [
    24
  ],
  "tenantid": [
    24,
    31
  ],
  "inbox": [
    25
  ],
  "threads": [
    25
  ],
  "individual": [
    25
  ],
  "conversations": [
    25
  ],
  "place": [
    25
  ],
  "identify": [
    25
  ],
  "tenants": [
    25,
    26,
    31,
    32
  ],
  "unread": [
    25
  ],
  "shows": [
    26
  ],
  "info": [
    26,
    31,
    32,
    34,
    41,
    45,
    46
  ],
  "upcoming": [
    26
  ],
  "renewals": [
    26
  ],
  "contact": [
    26,
    31,
    32,
    45,
    46
  ],
  "phone": [
    26,
    31,
    41
  ],
  "company": [
    26
  ],
  "generate": [
    27,
    40
  ],
  "finalise": [
    27
  ],
  "before": [
    27
  ],
  "sending": [
    27
  ],
  "margins": [
    27
  ],
  "confirm": [
    27
  ],
  "pricing": [
    27,
    28
  ],
  "sell": [
    27
  ],
  "prices": [
    27
  ],
  "profitability": [
    27
  ],
  "inline": [
    27
  ],
  "while": [
    27
  ],
  "reviewing": [
    27
  ],
  "ready": [
    27,
    33
  ],
  "quoteid": [
    27,
    28
  ],
  "signatures": [
    28
  ],
  "amendments": [
    28
  ],
  "accepted": [
    28,
    30
  ],
  "rejected": [
    28,
    30
  ],
  "amendment": [
    28
  ],
  "signed": [
    28,
    30
  ],
  "convert": [
    28
  ],
  "previous": [
    28
  ],
  "next": [
    28
  ],
  "versions": [
    28
  ],
  "facing": [
    29,
    30
  ],
  "optionally": [
    29
  ],
  "base": [
    29
  ],
  "title": [
    29
  ],
  "initial": [
    29
  ],
  "been": [
    30,
    36
  ],
  "past": [
    31
  ],
  "submitted": [
    31
  ],
  "information": [
    31
  ],
  "assignment": [
    32
  ],
  "ended": [
    32
  ],
  "tracking": [
    33,
    37
  ],
  "billable": [
    33
  ],
  "entries": [
    33
  ],
  "entry": [
    33
  ],
  "logged": [
    33
  ],
  "label": [
    34
  ],
  "bedrooms": [
    34
  ],
  "unitid": [
    34
  ],
  "occupied": [
    35
  ],
  "assignments": [
    36
  ],
  "agreed": [
    36
  ],
  "costs": [
    36
  ],
  "actual": [
    36
  ],
  "workspace": [
    37
  ],
  "choose": [
    37
  ],
  "other": [
    37,
    38
  ],
  "freelance": [
    37,
    38,
    42
  ],
  "general": [
    37
  ],
  "miscellaneous": [
    37
  ],
  "workspaces": [
    38
  ],
  "creation": [
    38
  ],
  "shortcuts": [
    38
  ],
  "intake": [
    38,
    42
  ],
  "upload": [
    39,
    44,
    45
  ],
  "automatically": [
    39
  ],
  "extracts": [
    39
  ],
  "receipt": [
    39
  ],
  "image": [
    39
  ],
  "processing": [
    39
  ],
  "extracted": [
    39
  ],
  "matching": [
    39
  ],
  "retry": [
    39
  ],
  "failed": [
    39
  ],
  "records": [
    39
  ],
  "rules": [
    40,
    41,
    44
  ],
  "that": [
    40
  ],
  "auto": [
    40
  ],
  "import": [
    40,
    44
  ],
  "accept": [
    40
  ],
  "suggested": [
    40
  ],
  "agent": [
    40
  ],
  "suggestions": [
    40,
    44
  ],
  "settings": [
    41
  ],
  "user": [
    41
  ],
  "preferences": [
    41
  ],
  "methods": [
    41
  ],
  "address": [
    41
  ],
  "number": [
    41
  ],
  "website": [
    41
  ],
  "transfer": [
    41
  ],
  "paypal": [
    41
  ],
  "stripe": [
    41
  ],
  "text": [
    41
  ],
  "configure": [
    41
  ],
  "used": [
    41
  ],
  "generation": [
    41
  ],
  "clients": [
    42
  ],
  "quick": [
    42
  ],
  "actions": [
    42
  ],
  "money": [
    42
  ],
  "unsent": [
    42
  ],
  "cards": [
    42
  ],
  "collected": [
    42
  ],
  "studio": [
    42
  ],
  "browse": [
    43
  ],
  "bulk": [
    43
  ],
  "duplicate": [
    43
  ],
  "unwanted": [
    43
  ],
  "rule": [
    43
  ],
  "edited": [
    43
  ],
  "file": [
    44
  ],
  "assisted": [
    44
  ],
  "column": [
    44
  ],
  "mapping": [
    44
  ],
  "drop": [
    44
  ],
  "columns": [
    44
  ],
  "right": [
    44
  ],
  "fields": [
    44
  ],
  "preview": [
    44
  ],
  "will": [
    44
  ],
  "duplicates": [
    44
  ],
  "after": [
    44
  ],
  "uploaded": [
    45
  ],
  "documents": [
    45,
    46
  ],
  "payments": [
    45
  ],
  "contracts": [
    45
  ],
  "insurance": [
    45
  ],
  "vendorid": [
    45
  ],
  "subcontractors": [
    46
  ]
}
