export interface CompanyBranding {
  logo: string
  address: string
  email: string
  iban: string
  bic: string
  taxNumber: string
}

const prefix = 'leonety-company-branding'

function getKey(companyId: string) {
  return `${prefix}:${companyId}`
}

export function loadCompanyBranding(companyId: string | null | undefined): CompanyBranding {
  if (!companyId || typeof window === 'undefined') {
    return { logo: '', address: '', email: '', iban: '', bic: '', taxNumber: '' }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getKey(companyId)) ?? '{}') as Partial<CompanyBranding>
    return {
      logo: typeof parsed.logo === 'string' ? parsed.logo : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      iban: typeof parsed.iban === 'string' ? parsed.iban : '',
      bic: typeof parsed.bic === 'string' ? parsed.bic : '',
      taxNumber: typeof parsed.taxNumber === 'string' ? parsed.taxNumber : '',
    }
  } catch {
    return { logo: '', address: '', email: '', iban: '', bic: '', taxNumber: '' }
  }
}

export function saveCompanyBranding(companyId: string, branding: Partial<CompanyBranding>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getKey(companyId), JSON.stringify({
    ...loadCompanyBranding(companyId),
    ...branding,
  }))
}
