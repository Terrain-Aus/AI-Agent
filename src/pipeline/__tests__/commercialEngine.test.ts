import { describe, it, expect } from 'vitest'
import { commercialEngine } from '../commercialEngine'
import type { PricingPolicy, RateResult } from '../types'

const policy: PricingPolicy = {
  targetMargin: 0.25,
  marginFloor: 0.1,
  overheadPercent: 0.08,
  riskContingencyDefault: 0.05,
  minimumQuoteValue: 500,
  rounding: { mode: 'nearest', nearest: 10 },
}

const rate: RateResult = {
  costedLines: [
    { quantityLineId: 'l1', quantity: 1, unit: 'ea', unitRate: 1000, lineCost: 1000 },
    { quantityLineId: 'l2', quantity: 1, unit: 'ea', unitRate: 500, lineCost: 500 },
  ],
  totalCost: 1500,
  rateSnapshot: [],
}

describe('CommercialEngine — RULE: derives sell from RateResult + policy only', () => {
  it('applies target margin on sell to each line', () => {
    const c = commercialEngine(rate, policy, {})
    // 1000 / (1 - 0.25) = 1333.33
    expect(c.pricedLines[0].sell).toBeCloseTo(1333.33, 1)
    expect(c.pricedLines[0].margin).toBeCloseTo(333.33, 1)
  })

  it('adds overhead and risk contingency on top of line sells', () => {
    const c = commercialEngine(rate, policy, {})
    expect(c.overhead).toBeCloseTo(1500 * 0.08, 2)
    expect(c.riskContingency).toBeCloseTo(1500 * 0.05, 2)
    expect(c.quotedTotal).toBeGreaterThan(c.marginTotal + rate.totalCost)
  })

  it('honours risk-input overrides for overhead and contingency', () => {
    const c = commercialEngine(rate, policy, { overheadPercentOverride: 0.2, riskContingencyPercent: 0.15 })
    expect(c.overhead).toBeCloseTo(1500 * 0.2, 2)
    expect(c.riskContingency).toBeCloseTo(1500 * 0.15, 2)
  })

  it('rounds the quoted total to the policy rounding rule', () => {
    const c = commercialEngine(rate, policy, {})
    expect(c.quotedTotal % 10).toBe(0)
  })
})
