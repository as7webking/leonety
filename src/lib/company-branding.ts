export interface CompanyBranding {
  logo: string
  address: string
}

const prefix = 'leonety-company-branding'

function getKey(companyId: string) {
  return `${prefix}:${companyId}`
}

export function loadCompanyBranding(companyId: string | null | undefined): CompanyBranding {
  if (!companyId || typeof window === 'undefined') {
    return { logo: '', address: '' }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getKey(companyId)) ?? '{}') as Partial<CompanyBranding>
    return {
      logo: typeof parsed.logo === 'string' ? parsed.logo : '',
      address: typeof parsed.address === 'string' ? parsed.address : '',
    }
  } catch {
    return { logo: '', address: '' }
  }
}

export function saveCompanyBranding(companyId: string, branding: CompanyBranding) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getKey(companyId), JSON.stringify(branding))
}
