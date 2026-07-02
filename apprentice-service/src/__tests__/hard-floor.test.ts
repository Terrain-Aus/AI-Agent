import { describe, it, expect } from 'vitest'
import {
  DEFAULT_HARD_FLOOR_CONFIG,
  createHardFloorConfig,
  isHardFloorCategory,
} from '../hard-floor'
import type { RemediationCategory } from '../categories'

describe('HardFloorConfig', () => {
  it('defaults to spoilDisposal + serviceProtection', () => {
    expect([...DEFAULT_HARD_FLOOR_CONFIG.categories]).toEqual(['spoilDisposal', 'serviceProtection'])
  })

  it('must never be empty — the factory throws on []', () => {
    expect(() => createHardFloorConfig([])).toThrow(/never be empty/i)
  })

  it('rejects unknown categories', () => {
    expect(() => createHardFloorConfig(['spoilDisposal', 'nope' as RemediationCategory])).toThrow(/unknown hard-floor category/i)
  })

  it('builds a config from approved categories', () => {
    const cfg = createHardFloorConfig(['tipFees', 'dewatering'])
    expect([...cfg.categories]).toEqual(['tipFees', 'dewatering'])
  })

  it('reports membership correctly', () => {
    expect(isHardFloorCategory(DEFAULT_HARD_FLOOR_CONFIG, 'spoilDisposal')).toBe(true)
    expect(isHardFloorCategory(DEFAULT_HARD_FLOOR_CONFIG, 'serviceProtection')).toBe(true)
    expect(isHardFloorCategory(DEFAULT_HARD_FLOOR_CONFIG, 'siteAccess')).toBe(false)
  })
})
