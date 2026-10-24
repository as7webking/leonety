export function isValidContractClientId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function getContractsCreateRedirect(clientId: unknown) {
  const query = new URLSearchParams({ mode: 'create' })
  if (isValidContractClientId(clientId)) query.set('clientId', clientId)
  return `/app/contracts?${query.toString()}`
}
