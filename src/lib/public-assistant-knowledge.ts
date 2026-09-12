import type { Locale } from '@/lib/i18n'

export function buildPublicAssistantKnowledge(locale: Locale) {
  return {
    product: 'Leonety is a multilingual SaaS workspace for income, expenses, transactions, time, clients, invoices, contracts, products, inventory, stock movements, printing, exports and selected integrations.',
    access: {
      signup: '/signup',
      login: '/login',
      pricing: '/#pricing',
    },
    plans: 'Leonety currently presents Free, Starter, Pro and Business plans. Exact prices and trial availability must be taken from the pricing section, not invented.',
    integrations: {
      available: ['WooCommerce'],
      setupRequired: ['Google Merchant', 'Meta / Instagram', 'WhatsApp Business'],
      beta: ['TikTok Shop'],
      comingSoon: ['ISS POS'],
    },
    assistant: 'The public assistant can explain public Leonety features, pricing, integrations, signup and login. It has no access to accounts or private workspace data.',
    locale,
  }
}
