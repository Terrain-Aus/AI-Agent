import { describe, it, expect } from 'vitest'
import { REMEDIATION_CATEGORIES, isApprovedCategory } from '../categories'

const APPROVED = [
  'spoilDisposal',
  'serviceProtection',
  'siteAccess',
  'trafficManagement',
  'dewatering',
  'compactionTesting',
  'reinstatement',
  'mobilisation',
  'weatherAllowance',
  'tipFees',
  'permitsAndFees',
  'plantFloat',
]

describe('RemediationCategory registry', () => {
  it('is exactly the approved 12-category set, in order', () => {
    expect([...REMEDIATION_CATEGORIES]).toEqual(APPROVED)
  })

  it('accepts every approved category', () => {
    for (const c of APPROVED) expect(isApprovedCategory(c)).toBe(true)
  })

  it('rejects unknown categories and non-strings', () => {
    for (const x of ['completeness', 'commercial', 'made-up', '', null, undefined, 7, {}]) {
      expect(isApprovedCategory(x)).toBe(false)
    }
  })
})
