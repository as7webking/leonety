import type { Locale } from '@/lib/i18n'

export const assistantSupportedRoutes = [
  '/app/dashboard',
  '/app/income',
  '/app/expenses',
  '/app/transactions',
  '/app/time',
  '/app/shifts',
  '/app/employees',
  '/app/clients',
  '/app/invoices',
  '/app/products',
  '/app/inventory',
  '/app/stock-movements',
  '/app/settings/integrations',
  '/app/settings/integrations/woocommerce',
  '/app/profile',
  '/app/upgrade',
  '/app/contracts',
] as const

export function normalizeAssistantRoute(pathname: unknown) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/app')) return '/app/dashboard'
  const cleanPath = pathname.split('?')[0].split('#')[0]
  return assistantSupportedRoutes.find((route) => cleanPath === route || cleanPath.startsWith(`${route}/`)) ?? '/app/dashboard'
}

export function buildLeonetyAssistantKnowledge(locale: Locale, pathname: string) {
  return JSON.stringify({
    product: 'Leonety',
    locale,
    currentRoute: normalizeAssistantRoute(pathname),
    role: 'Application/product assistant for authenticated Leonety users.',
    boundaries: [
      'Do not act as an accountant, tax adviser, lawyer, financial adviser or certified e-signature provider.',
      'Do not claim that unsupported integrations are fully connected.',
      'Do not tell the user that you changed or deleted data from chat.',
      'If exact legal, tax or accounting advice is needed, advise review by a qualified professional.',
    ],
    features: {
      dashboard: 'Shows workspace summaries and links into finances, inventory and tools.',
      income: 'Users can add, edit, import, export and print income records. Signed amounts are supported where the transaction form permits them.',
      expenses: 'Users can add, edit, import, export and print expenses. Purchases can be recorded manually and inventory purchase expenses can be linked from stock movement workflow when configured.',
      transactions: 'All transactions combines income and expenses for filtering, reporting, CSV export and print.',
      kassenbuch: 'Transactions printing offers Standard and Kassenbuch formats. Kassenbuch is a print-only five-column cash-book view with chronological running balance, daily closings, multi-month page breaks, optional month-end balance and optional document page numbers. It does not create or change accounting records.',
      time: 'Time tracking supports entries, timers and printable reports. Shifts are managed separately in Shifts.',
      employees: 'Employees has dedicated list, create, profile and edit pages. Country-aware profile fields and private employee documents are kept out of Assistant context.',
      shifts: 'Shifts schedules employees by date, time and location. Open Shifts to plan or review them.',
      clients: 'Clients can be created manually, imported from CSV/Google Contacts where configured, and used for invoices/contracts.',
      invoices: 'Invoices can be created from client/product data, printed, and selected invoices can be printed as a combined report/PDF through browser print.',
      products: 'Leonety products are canonical. Products hold SKU, barcode, category, purchase price, selling price, stock, image and channel publishing state. Use Edit on Products, or Edit product from Inventory, to open the same product editor.',
      inventory: 'Inventory references the canonical product. Product details are edited in the product editor; quantities are controlled through stock movements, not silent direct edits.',
      stockMovements: 'Stock movements record stock in/out, adjustments, returns and purchase-related expense creation when the user explicitly selects it.',
      woocommerce: 'WooCommerce can be connected with REST API keys and supports product import/sync where configured.',
      integrations: 'Marketplace and messaging integrations may require provider setup, partner approval or OAuth. Do not describe setup-required providers as connected.',
      notifications: 'Incoming order notifications are implemented for verified WooCommerce new-order webhooks. Configure them in Settings > Integrations > WooCommerce and choose Enable on this device. The user must explicitly grant permission; exactly one device is selected per workspace. iPhone/iPad background push requires the installed Home Screen web app. The operating system controls lock-screen sound and Focus/Do Not Disturb.',
      profile: 'Profile contains account, company and billing controls available to the signed-in user.',
      billing: 'Paddle controls paid subscription access through verified billing state/webhooks. Success URLs or query strings do not grant paid access.',
      contracts: 'Contract Builder may generate draft contracts server-side when AI is configured. It is drafting support, not legal advice.',
      pwa: 'Leonety is an installable web app where the browser/platform supports PWA installation.',
    },
    commonTasks: [
      'Add an expense: open Expenses, choose Add expense, enter amount, description, category, date and save.',
      'Create an invoice: open Invoices, choose Add invoice, select or create a client, add line items, tax settings and save/print.',
      'Add stock: open Stock movements, choose product, movement purpose, quantity, reason and save.',
      'Connect WooCommerce: open Settings > Integrations > WooCommerce, enter store URL and REST API credentials from WooCommerce settings.',
      'Print transactions: open Transactions, choose date range and Print.',
      'Print Kassenbuch: open Transactions, choose Print, select Kassenbuch and choose the available month-end/page-number options before printing.',
      'Edit a product: open Products and choose Edit. From Inventory choose Edit product to open the same canonical editor.',
      'Enable incoming-order notifications: open Settings > Integrations > WooCommerce, find Incoming order notifications, choose Enable on this device, grant browser permission and select the device for workspace alerts.',
      'Cancel subscription: open Profile/Upgrade billing controls and use Paddle-backed cancellation if available.',
    ],
  })
}
