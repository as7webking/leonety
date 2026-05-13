export function getContactEmail() {
  return process.env.LEONETY_CONTACT_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || process.env.UPGRADE_REQUEST_ADMIN_EMAIL?.trim() || ''
}
