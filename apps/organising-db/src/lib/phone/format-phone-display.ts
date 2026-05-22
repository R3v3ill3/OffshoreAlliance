/**
 * Format stored phone numbers for on-screen display during calling.
 * Converts international (+61) numbers to local Australian format with spacing.
 *
 * Examples:
 *   +61400100014 → 0400 100 014
 *   0298765432   → 02 9876 5432
 *   1300123456   → 1300 123 456
 */
export function formatAustralianPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return phone.trim()

  let local = digits

  if (local.startsWith('61') && local.length >= 11) {
    local = `0${local.slice(2)}`
  } else if (local.length === 9) {
    local = `0${local}`
  }

  if (local.startsWith('04') && local.length === 10) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }

  if (/^0[2378]/.test(local) && local.length === 10) {
    return `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`
  }

  if (/^1[38]00/.test(local) && local.length === 10) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }

  if (local.startsWith('0') && local.length === 10) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }

  return phone.trim()
}
