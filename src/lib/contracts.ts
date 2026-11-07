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
  legalForm: string
  address: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  region: string
  email: string
  phone: string
  taxNumber: string
  vatId: string
  commercialRegister: string
  registerCourt: string
  registrationNumber: string
  professionalRegulatoryInfo: string
  additionalLegalText: string
  /** Legacy untyped identifier. Keep as entered; never relabel it as a VAT ID. */
  taxId: string
  representative: string
  country: string
}

export interface ContractPartySource {
  name?: string | null
  company?: string | null
  legalForm?: string | null
  address?: string | null
  street?: string | null
  houseNumber?: string | null
  postalCode?: string | null
  city?: string | null
  region?: string | null
  email?: string | null
  phone?: string | null
  taxNumber?: string | null
  vatId?: string | null
  commercialRegister?: string | null
  registerCourt?: string | null
  registrationNumber?: string | null
  professionalRegulatoryInfo?: string | null
  additionalLegalText?: string | null
  taxId?: string | null
  representative?: string | null
  country?: string | null
}

export type ContractPartyField = Exclude<keyof ContractPartySnapshot, 'taxId'>

export const contractPartyFields: ContractPartyField[] = [
  'name', 'company', 'legalForm', 'representative', 'street', 'houseNumber',
  'postalCode', 'city', 'region', 'address', 'country', 'email', 'phone',
  'taxNumber', 'vatId', 'commercialRegister', 'registerCourt', 'registrationNumber',
  'professionalRegulatoryInfo', 'additionalLegalText',
]

export function normalizeContractPartySnapshot(value: unknown): ContractPartySnapshot {
  const record = value && typeof value === 'object' ? value as Partial<ContractPartySnapshot> : {}
  return Object.fromEntries(
    Object.keys(emptyPartySnapshot).map((key) => [key, typeof record[key as keyof ContractPartySnapshot] === 'string'
      ? record[key as keyof ContractPartySnapshot]
      : '']),
  ) as unknown as ContractPartySnapshot
}

export function createCompanyPartySnapshot(
  legal: {
    legal_name?: string | null
    legal_representative?: string | null
    legal_street?: string | null
    legal_house_number?: string | null
    legal_postal_code?: string | null
    legal_city?: string | null
    legal_country_code?: string | null
    legal_email?: string | null
    legal_phone?: string | null
    vat_id?: string | null
    commercial_register?: string | null
    register_court?: string | null
    registration_number?: string | null
    professional_regulatory_info?: string | null
    additional_legal_text?: string | null
  },
  fallbackName = '',
): ContractPartySnapshot {
  const company = legal.legal_name?.trim() || fallbackName
  return {
    ...emptyPartySnapshot,
    name: '',
    company,
    address: '',
    street: legal.legal_street?.trim() ?? '',
    houseNumber: legal.legal_house_number?.trim() ?? '',
    postalCode: legal.legal_postal_code?.trim() ?? '',
    city: legal.legal_city?.trim() ?? '',
    email: legal.legal_email?.trim() ?? '',
    phone: legal.legal_phone?.trim() ?? '',
    vatId: legal.vat_id?.trim() ?? '',
    commercialRegister: legal.commercial_register?.trim() ?? '',
    registerCourt: legal.register_court?.trim() ?? '',
    registrationNumber: legal.registration_number?.trim() ?? '',
    professionalRegulatoryInfo: legal.professional_regulatory_info?.trim() ?? '',
    additionalLegalText: legal.additional_legal_text?.trim() ?? '',
    representative: legal.legal_representative?.trim() ?? '',
    country: legal.legal_country_code?.trim() ?? '',
  }
}

export function createClientPartySnapshot(client: ContractPartySource): ContractPartySnapshot {
  return {
    ...emptyPartySnapshot,
    name: client.name?.trim() ?? '',
    company: client.company?.trim() ?? '',
    address: client.address?.trim() ?? '',
    street: client.street?.trim() ?? '',
    houseNumber: client.houseNumber?.trim() ?? '',
    postalCode: client.postalCode?.trim() ?? '',
    city: client.city?.trim() ?? '',
    region: client.region?.trim() ?? '',
    email: client.email?.trim() ?? '',
    phone: client.phone?.trim() ?? '',
    taxNumber: client.taxNumber?.trim() ?? '',
    vatId: client.vatId?.trim() ?? '',
    commercialRegister: client.commercialRegister?.trim() ?? '',
    registerCourt: client.registerCourt?.trim() ?? '',
    registrationNumber: client.registrationNumber?.trim() ?? '',
    professionalRegulatoryInfo: client.professionalRegulatoryInfo?.trim() ?? '',
    additionalLegalText: client.additionalLegalText?.trim() ?? '',
    taxId: client.taxId?.trim() ?? '',
    representative: client.representative?.trim() ?? '',
    country: client.country?.trim() ?? '',
  }
}

export function refreshCompanyPartySnapshot(
  current: ContractPartySnapshot,
  profile: ContractPartySnapshot,
): ContractPartySnapshot {
  const sourceFields: ContractPartyField[] = [
    'company', 'representative', 'street', 'houseNumber', 'postalCode', 'city',
    'country', 'email', 'phone', 'vatId', 'commercialRegister', 'registerCourt', 'registrationNumber',
    'professionalRegulatoryInfo', 'additionalLegalText',
  ]
  const next = { ...current }
  for (const field of sourceFields) next[field] = profile[field]
  return next
}

export function refreshClientPartySnapshot(
  current: ContractPartySnapshot,
  profile: ContractPartySnapshot,
): ContractPartySnapshot {
  const sourceFields: ContractPartyField[] = [
    'name', 'company', 'street', 'houseNumber', 'postalCode', 'city', 'country', 'email', 'phone', 'taxNumber',
  ]
  const next = { ...current }
  for (const field of sourceFields) next[field] = profile[field]
  return next
}

export interface ContractPartyLabels {
  name: string
  company: string
  legalForm: string
  representative: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  region: string
  address: string
  country: string
  email: string
  phone: string
  taxNumber: string
  vatId: string
  commercialRegister: string
  registerCourt: string
  registrationNumber: string
  professionalRegulatoryInfo: string
  additionalLegalText: string
  legacyTaxId: string
}

export function getContractPartyLines(party: ContractPartySnapshot, labels: ContractPartyLabels) {
  const lines: Array<{ label: string; value: string }> = []
  const add = (label: string, value: string) => {
    if (value.trim()) lines.push({ label, value: value.trim() })
  }
  add(labels.company, party.company)
  add(labels.legalForm, party.legalForm)
  add(labels.name, party.name)
  add(labels.representative, party.representative)
  const streetLine = [party.street, party.houseNumber].filter(Boolean).join(' ')
  if (streetLine) add(labels.street, streetLine)
  else add(labels.address, party.address)
  if (streetLine && party.address) add(labels.address, party.address)
  add(labels.postalCode, party.postalCode)
  add(labels.city, party.city)
  add(labels.region, party.region)
  add(labels.country, party.country)
  add(labels.email, party.email)
  add(labels.phone, party.phone)
  add(labels.taxNumber, party.taxNumber)
  add(labels.vatId, party.vatId)
  add(labels.commercialRegister, party.commercialRegister)
  add(labels.registerCourt, party.registerCourt)
  add(labels.registrationNumber, party.registrationNumber)
  add(labels.professionalRegulatoryInfo, party.professionalRegulatoryInfo)
  add(labels.additionalLegalText, party.additionalLegalText)
  add(labels.legacyTaxId, party.taxId)
  return lines
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
  legalForm: '',
  address: '',
  street: '',
  houseNumber: '',
  postalCode: '',
  city: '',
  region: '',
  email: '',
  phone: '',
  taxNumber: '',
  vatId: '',
  commercialRegister: '',
  registerCourt: '',
  registrationNumber: '',
  professionalRegulatoryInfo: '',
  additionalLegalText: '',
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
