import { describe, it, expect } from 'vitest'
import { quantityEngine } from '../quantityEngine'
import { SEED_BUSINESS_INTELLIGENCE as BI } from '../seed'
import { sampleContext, findMoneyKeys } from './helpers'

describe('QuantityEngine — RULE: never shows dollars', () => {
  const result = quantityEngine(sampleContext(), BI.productivity)

  it('produces ZERO monetary fields anywhere in QuantityResult', () => {
    expect(findMoneyKeys(result)).toEqual([])
  })

  it('computes bank volume from area × depth', () => {
    // 80 m² × 200 mm = 16 m³
    expect(result.derived.cutFillVolumes.bankM3).toBe(16)
  })

  it('applies swell to loose volume', () => {
    expect(result.derived.cutFillVolumes.swellApplied).toBe(true)
    // clay swell 1.3 → 16 × 1.3 = 20.8
    expect(result.derived.cutFillVolumes.looseM3).toBeCloseTo(20.8, 2)
  })

  it('derives plant hours from dig productivity', () => {
    // 16 m³ ÷ 14 m³/hr (clay) ≈ 1.14 hr
    expect(result.derived.plantHours[0].hours).toBeCloseTo(1.14, 2)
  })

  it('emits physical lines for excavation, disposal and scope items', () => {
    const cats = result.lines.map((l) => l.category)
    expect(cats).toContain('plant')
    expect(cats).toContain('disposal')
    expect(cats).toContain('concrete')
  })
})
