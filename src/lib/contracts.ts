import type { Locale } from '@/lib/i18n'

export const contractStatuses = ['draft', 'finalized', 'archived'] as const
export const contractLanguages = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
export const contractTemplateIds = [
  'general_service',
  'website_development',
  'website_maintenance',
  'nda',
  'contractor',
  'software_development',
  'goods_sale',
  'custom',
] as const

export type ContractStatus = typeof contractStatuses[number]
export type ContractLanguage = typeof contractLanguages[number]
export type ContractTemplateId = typeof contractTemplateIds[number]

export interface ContractPartySnapshot {
  name: string
  company: string
  address: string
  email: string
  phone: string
  taxId: string
  representative: string
  country: string
}

export interface ContractTerms {
  effectiveDate: string
  projectDescription: string
  scope: string
  deliverables: string
  price: string
  currency: string
  paymentSchedule: string
  deposit: string
  milestones: string
  startDate: string
  completionDate: string
  supportPeriod: string
  intellectualProperty: string
  confidentiality: string
  termination: string
  liability: string
  governingLaw: string
  jurisdiction: string
  noticePeriod: string
  additionalClauses: string
  customNotes: string
}

export interface ContractClause {
  id: string
  heading: string
  body: string
}

export interface GeneratedContractDocument {
  title: string
  introduction: string
  clauses: ContractClause[]
  closing: string
}

export interface ContractTemplateField {
  key: keyof ContractTerms
  required?: boolean
}

export interface ContractTemplate {
  id: ContractTemplateId
  labelKey: string
  descriptionKey: string
  fields: ContractTemplateField[]
  clauseKeys: string[]
}

const baseFields: ContractTemplateField[] = [
  { key: 'effectiveDate', required: true },
  { key: 'projectDescription', required: true },
  { key: 'scope', required: true },
  { key: 'price' },
  { key: 'currency' },
  { key: 'paymentSchedule' },
  { key: 'deposit' },
  { key: 'startDate' },
  { key: 'completionDate' },
  { key: 'termination' },
  { key: 'liability' },
  { key: 'governingLaw' },
  { key: 'jurisdiction' },
  { key: 'additionalClauses' },
]

export const contractTemplates: ContractTemplate[] = [
  {
    id: 'general_service',
    labelKey: 'contracts.template.generalService',
    descriptionKey: 'contracts.template.generalServiceDescription',
    fields: baseFields,
    clauseKeys: ['parties', 'scope', 'payment', 'timeline', 'changes', 'confidentiality', 'termination', 'liability', 'law', 'signatures'],
  },
  {
    id: 'website_development',
    labelKey: 'contracts.template.websiteDevelopment',
    descriptionKey: 'contracts.template.websiteDevelopmentDescription',
    fields: [
      ...baseFields,
      { key: 'deliverables', required: true },
      { key: 'milestones' },
      { key: 'intellectualProperty' },
      { key: 'supportPeriod' },
    ],
    clauseKeys: ['parties', 'project', 'deliverables', 'milestones', 'payment', 'acceptance', 'ip', 'support', 'termination', 'law', 'signatures'],
  },
  {
    id: 'website_maintenance',
    labelKey: 'contracts.template.websiteMaintenance',
    descriptionKey: 'contracts.template.websiteMaintenanceDescription',
    fields: [
      { key: 'effectiveDate', required: true },
      { key: 'scope', required: true },
      { key: 'supportPeriod', required: true },
      { key: 'price' },
      { key: 'currency' },
      { key: 'paymentSchedule' },
      { key: 'noticePeriod' },
      { key: 'liability' },
      { key: 'additionalClauses' },
    ],
    clauseKeys: ['parties', 'services', 'response', 'exclusions', 'fees', 'term', 'termination', 'liability', 'law', 'signatures'],
  },
  {
    id: 'nda',
    labelKey: 'contracts.template.nda',
    descriptionKey: 'contracts.template.ndaDescription',
    fields: [
      { key: 'effectiveDate', required: true },
      { key: 'projectDescription', required: true },
      { key: 'confidentiality', required: true },
      { key: 'noticePeriod' },
      { key: 'governingLaw' },
      { key: 'jurisdiction' },
      { key: 'additionalClauses' },
    ],
    clauseKeys: ['parties', 'purpose', 'confidentialInfo', 'obligations', 'exclusions', 'return', 'term', 'law', 'signatures'],
  },
  {
    id: 'contractor',
    labelKey: 'contracts.template.contractor',
    descriptionKey: 'contracts.template.contractorDescription',
    fields: [
      ...baseFields,
      { key: 'deliverables' },
      { key: 'intellectualProperty' },
    ],
    clauseKeys: ['parties', 'independentContractor', 'services', 'deliverables', 'fees', 'expenses', 'ip', 'confidentiality', 'termination', 'law', 'signatures'],
  },
  {
    id: 'software_development',
    labelKey: 'contracts.template.softwareDevelopment',
    descriptionKey: 'contracts.template.softwareDevelopmentDescription',
    fields: [
      ...baseFields,
      { key: 'deliverables', required: true },
      { key: 'milestones' },
      { key: 'intellectualProperty', required: true },
      { key: 'supportPeriod' },
    ],
    clauseKeys: ['parties', 'specification', 'deliverables', 'milestones', 'testing', 'payment', 'ip', 'maintenance', 'warrantyDisclaimer', 'law', 'signatures'],
  },
  {
    id: 'goods_sale',
    labelKey: 'contracts.template.goodsSale',
    descriptionKey: 'contracts.template.goodsSaleDescription',
    fields: [
      { key: 'effectiveDate', required: true },
      { key: 'projectDescription', required: true },
      { key: 'deliverables', required: true },
      { key: 'price', required: true },
      { key: 'currency' },
      { key: 'paymentSchedule' },
      { key: 'startDate' },
      { key: 'completionDate' },
      { key: 'liability' },
      { key: 'governingLaw' },
      { key: 'jurisdiction' },
      { key: 'additionalClauses' },
    ],
    clauseKeys: ['parties', 'goods', 'price', 'delivery', 'inspection', 'risk', 'returns', 'liability', 'law', 'signatures'],
  },
  {
    id: 'custom',
    labelKey: 'contracts.template.custom',
    descriptionKey: 'contracts.template.customDescription',
    fields: [
      { key: 'effectiveDate', required: true },
      { key: 'projectDescription', required: true },
      { key: 'scope' },
      { key: 'price' },
      { key: 'currency' },
      { key: 'paymentSchedule' },
      { key: 'termination' },
      { key: 'governingLaw' },
      { key: 'jurisdiction' },
      { key: 'customNotes', required: true },
      { key: 'additionalClauses' },
    ],
    clauseKeys: ['parties', 'purpose', 'terms', 'payment', 'responsibilities', 'termination', 'law', 'signatures'],
  },
]

export const emptyPartySnapshot: ContractPartySnapshot = {
  name: '',
  company: '',
  address: '',
  email: '',
  phone: '',
  taxId: '',
  representative: '',
  country: '',
}

export const emptyContractTerms: ContractTerms = {
  effectiveDate: '',
  projectDescription: '',
  scope: '',
  deliverables: '',
  price: '',
  currency: 'EUR',
  paymentSchedule: '',
  deposit: '',
  milestones: '',
  startDate: '',
  completionDate: '',
  supportPeriod: '',
  intellectualProperty: '',
  confidentiality: '',
  termination: '',
  liability: '',
  governingLaw: '',
  jurisdiction: '',
  noticePeriod: '',
  additionalClauses: '',
  customNotes: '',
}

export function getContractTemplate(templateId: string | null | undefined) {
  return contractTemplates.find((template) => template.id === templateId) ?? contractTemplates[0]
}

export function isContractLanguage(value: string): value is ContractLanguage {
  return contractLanguages.includes(value as ContractLanguage)
}

export function isContractStatus(value: string): value is ContractStatus {
  return contractStatuses.includes(value as ContractStatus)
}

export function createEmptyDocument(title = ''): GeneratedContractDocument {
  return {
    title,
    introduction: '',
    clauses: [],
    closing: '',
  }
}

export function createContractReference(date = new Date()) {
  const year = date.getFullYear()
  const suffix = `${date.getTime()}`.slice(-6)
  return `CTR-${year}-${suffix}`
}

export function getLanguageName(locale: Locale | ContractLanguage) {
  const names: Record<ContractLanguage, string> = {
    en: 'English',
    de: 'Deutsch',
    ru: 'Русский',
    tr: 'Türkçe',
    uk: 'Українська',
    pl: 'Polski',
    fr: 'Français',
  }
  return names[locale as ContractLanguage] ?? names.en
}
