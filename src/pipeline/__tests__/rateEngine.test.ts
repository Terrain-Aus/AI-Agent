import { describe, it, expect } from 'vitest'
import { quantityEngine } from '../quantityEngine'
import { rateEngine } from '../rateEngine'
import { SEED_BUSINESS_INTELLIGENCE as BI } from '../seed'
import { sampleContext } from './helpers'

describe('RateEngine — RULE: stateless, rates passed in, persists nothing', () => {
  const q = quantityEngine(sampleContext(), BI.productivity)

  it('costs each physical line at the supplied rate', () => {
    const r = rateEngine(q, BI.rates)
    const conc = r.costedLines.find((l) => l.quantityLineId === 'qty-conc')!
    expect(conc.unitRate).toBe(295) // seed conc25
    expect(conc.lineCost).toBe(16 * 295)
  })

  it('totalCost equals the sum of line costs', () => {
    const r = rateEngine(q, BI.rates)
    const sum = r.costedLines.reduce((s, l) => s + l.lineCost, 0)
    expect(r.totalCost).toBeCloseTo(sum, 2)
  })

  it('records the exact rates used in an immutable snapshot', () => {
    const r = rateEngine(q, BI.rates)
    expect(r.rateSnapshot.length).toBe(q.lines.length)
    expect(r.rateSnapshot.some((s) => s.kind === 'material' && s.refId === 'conc25')).toBe(true)
  })

  it('is pure: same inputs → same output, inputs not mutated', () => {
    const qSnap = JSON.stringify(q)
    const ratesSnap = JSON.stringify(BI.rates)
    const a = rateEngine(q, BI.rates)
    const b = rateEngine(q, BI.rates)
    expect(a).toEqual(b)
    expect(JSON.stringify(q)).toBe(qSnap)
    expect(JSON.stringify(BI.rates)).toBe(ratesSnap)
  })

  it('uses DIFFERENT rates when different rates are passed (no internal store)', () => {
    const cheaper = { ...BI.rates, materialRates: { ...BI.rates.materialRates, conc25: { materialId: 'conc25', unit: 'm3' as const, costRate: 100 } } }
    const r = rateEngine(q, cheaper)
    const conc = r.costedLines.find((l) => l.quantityLineId === 'qty-conc')!
    expect(conc.unitRate).toBe(100)
  })
})
