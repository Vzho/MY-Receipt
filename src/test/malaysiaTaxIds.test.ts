import { describe, expect, it } from 'vitest'
import { isLikelyMalaysiaCompanyRegNo, isValidSstNo, normalizeSstNo } from '../lib/malaysiaTaxIds'

describe('malaysia tax id helpers', () => {
  it('normalizes and validates SST registration numbers', () => {
    expect(normalizeSstNo('a00123400000000')).toBe('A00-1234-00000000')
    expect(isValidSstNo('A00-1234-00000000')).toBe(true)
    expect(isValidSstNo('A00-123-00000000')).toBe(false)
  })

  it('accepts common SSM company registration formats', () => {
    expect(isLikelyMalaysiaCompanyRegNo('198901002708')).toBe(true)
    expect(isLikelyMalaysiaCompanyRegNo('2024012345678')).toBe(true)
    expect(isLikelyMalaysiaCompanyRegNo('198901002708 (180014-P)')).toBe(true)
    expect(isLikelyMalaysiaCompanyRegNo('PG0187462-K')).toBe(true)
    expect(isLikelyMalaysiaCompanyRegNo('NOT-A-REG-NO')).toBe(false)
  })
})
