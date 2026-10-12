import { domainToASCII } from 'node:url'

const publicSuffixLabels = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.cn', 'com.sg', 'co.jp', 'co.in'])

export function isMailboxRelatedHost(host: string, emailDomain: string, mxHosts: string[]) {
  const normalizedHost = domainToASCII(host.trim().replace(/\.$/, '').toLowerCase())
  const normalizedEmail = domainToASCII(emailDomain.trim().replace(/\.$/, '').toLowerCase())
  if (!normalizedHost || !normalizedEmail) return false
  if (normalizedHost === normalizedEmail || normalizedHost.endsWith(`.${normalizedEmail}`)) return true
  const hostParent = normalizedHost.split('.').slice(1).join('.')
  return mxHosts.some((mx) => {
    const normalizedMx = domainToASCII(mx.trim().replace(/\.$/, '').toLowerCase())
    if (!normalizedMx) return false
    if (normalizedHost === normalizedMx || normalizedHost.endsWith(`.${normalizedMx}`)) return true
    const mxParent = normalizedMx.split('.').slice(1).join('.')
    return hostParent.length > 0 && hostParent === mxParent && !publicSuffixLabels.has(hostParent)
  })
}
