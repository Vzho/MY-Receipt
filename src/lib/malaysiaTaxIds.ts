export function normalizeSstNo(value: string | null | undefined) {
  const compact = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!compact) return ''
  if (/^[A-Z]\d{14}$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3, 7)}-${compact.slice(7)}`
  }
  return String(value ?? '').trim().toUpperCase()
}

export function isValidSstNo(value: string | null | undefined) {
  const normalized = normalizeSstNo(value)
  return !normalized || /^[A-Z]\d{2}-\d{4}-\d{8}$/.test(normalized)
}

export function isLikelyMalaysiaCompanyRegNo(value: string | null | undefined) {
  const input = String(value ?? '').trim().toUpperCase()
  if (!input) return true

  const compactDigits = input.replace(/\D/g, '')
  if (/^\d{12,13}$/.test(compactDigits) && input.replace(/\s+/g, '') === compactDigits) return true
  if (/^\d{12,13}\s*\([A-Z0-9-]{4,}\)$/.test(input)) return true
  if (/^[A-Z0-9]{5,}-[A-Z0-9]$/.test(input)) return true
  if (/^PG\d{6,}-[A-Z0-9]$/.test(input)) return true

  return false
}
