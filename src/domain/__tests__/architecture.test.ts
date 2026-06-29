// Architecture guard — the four rules enforced at the MODULE boundary.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Strip comments so the guard tests inspect CODE (imports/usage), not prose.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const read = (rel: string) => stripComments(readFileSync(resolve(process.cwd(), 'src/domain', rel), 'utf8'))

describe('Four non-negotiable rules — structural', () => {
  it('R2: Rate Engine never imports BusinessIntelligence (reads the RateBook only)', () => {
    const src = read('rateEngine.ts')
    expect(src).not.toMatch(/seedQLD|businessIntelligence|BusinessIntelligence/)
    expect(src).not.toMatch(/from ['"]\.\/rateBook['"]/) // doesn't recompute the projection either
    expect(src).toMatch(/RateBook/)
  })

  it('R3: Commercial Engine is never handed BI or the RateBook', () => {
    const src = read('commercialEngine.ts')
    expect(src).not.toMatch(/RateBook|BusinessIntelligence|seedQLD|projectRateBook|resolveRate/)
    expect(src).toMatch(/RateResult/)
    expect(src).toMatch(/PricingPolicy/)
    expect(src).toMatch(/RiskAssessment/)
  })

  it('R1: Quantity Engine imports no rate/money projection', () => {
    const src = read('quantityEngine.ts')
    expect(src).not.toMatch(/RateBook|projectRateBook|Pricing\b/)
    expect(src).toMatch(/qty/) // money-free quantities only via qty()
  })

  it('R4: only the projection (rateBook) reads BI', () => {
    // The rate book is the single seam BI → numbers.
    const src = read('rateBook.ts')
    expect(src).toMatch(/BusinessIntelligence/)
  })
})
