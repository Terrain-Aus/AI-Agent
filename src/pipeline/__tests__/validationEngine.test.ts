import { describe, it, expect } from 'vitest'
import { validationEngine, canSend } from '../validationEngine'
import { quantityEngine } from '../quantityEngine'
import { rateEngine } from '../rateEngine'
import { commercialEngine } from '../commercialEngine'
import { SEED_BUSINESS_INTELLIGENCE as BI } from '../seed'
import { sampleContext } from './helpers'
import type { CommercialResult, PricingPolicy, QuantityResult } from '../types'

const policy = BI.pricingPolicy

describe('ValidationEngine — RULE: the gate, nothing leaves on fail', () => {
  it('FAILS and blocks send when margin is below the floor', () => {
    const commercial: CommercialResult = {
      pricedLines: [{ lineId: 'l1', cost: 980, margin: 20, sell: 1000 }],
      overhead: 0,
      riskContingency: 0,
      marginTotal: 20, // 20 / 1000 = 2% < 10% floor
      quotedTotal: 1000,
    }
    const quantity: QuantityResult = {
      lines: [{ id: 'l1', description: 'x', quantity: 1, unit: 'ea', category: 'other' }],
      derived: { cutFillVolumes: { swellApplied: true, bankM3: 0, looseM3: 0 }, disposalTonnes: 0, plantHours: [] },
    }
    const v = validationEngine(commercial, quantity, BI.jobHistory, policy)
    expect(v.status).toBe('fail')
    expect(v.checks.some((c) => c.rule === 'marginBelowFloor' && c.severity === 'fail')).toBe(true)
    expect(canSend(v)).toBe(false)
  })

  it('warns about a forgotten mobilisation line on a dig job', () => {
    const ctx = sampleContext()
    const q = quantityEngine(ctx, BI.productivity)
    const r = rateEngine(q, BI.rates)
    const c = commercialEngine(r, policy, {})
    const v = validationEngine(c, q, BI.jobHistory, policy)
    expect(v.checks.some((x) => x.rule === 'missingMobilisation')).toBe(true)
  })

  it('passes (or warns) and allows send when the quote is healthy', () => {
    const ctx = sampleContext()
    const q = quantityEngine(ctx, BI.productivity)
    const r = rateEngine(q, BI.rates)
    const c = commercialEngine(r, policy, {})
    const v = validationEngine(c, q, BI.jobHistory, policy)
    expect(v.status === 'pass' || v.status === 'warn').toBe(true)
    expect(canSend(v)).toBe(true)
  })

  it('flags a $0 line where no rate matched', () => {
    const quantity: QuantityResult = {
      lines: [{ id: 'l1', description: 'mystery', quantity: 5, unit: 'ea', category: 'other' }],
      derived: { cutFillVolumes: { swellApplied: true, bankM3: 0, looseM3: 0 }, disposalTonnes: 0, plantHours: [] },
    }
    const commercial: CommercialResult = {
      pricedLines: [{ lineId: 'l1', cost: 0, margin: 0, sell: 0 }],
      overhead: 0,
      riskContingency: 0,
      marginTotal: 9999,
      quotedTotal: 9999,
    }
    const v = validationEngine(commercial, quantity, BI.jobHistory, policy as PricingPolicy)
    expect(v.checks.some((c) => c.rule === 'lineBelowPlausibleUnitRate')).toBe(true)
  })
})
