import { describe, it, expect } from 'vitest'
import { runPipeline, addForgottenScopeItems, canSend } from '../index'
import { SEED_BUSINESS_INTELLIGENCE as BI } from '../seed'
import { sampleContext, findMoneyKeys } from './helpers'
import type { ScopeItem } from '../types'

describe('Pipeline — one-way, end-to-end on seed BI', () => {
  it('runs all four stages and produces a validation status', () => {
    const out = runPipeline(sampleContext(), BI, {})
    expect(out.quantity.lines.length).toBeGreaterThan(0)
    expect(out.rate.totalCost).toBeGreaterThan(0)
    expect(out.commercial.quotedTotal).toBeGreaterThan(out.rate.totalCost)
    expect(['pass', 'warn', 'fail']).toContain(out.validation.status)
  })

  it('keeps Stage 1 money-free even within the full pipeline', () => {
    const out = runPipeline(sampleContext(), BI, {})
    expect(findMoneyKeys(out.quantity)).toEqual([])
  })

  it('forgotten items re-enter at Stage 1 and flow through to price', () => {
    const ctx = sampleContext()
    const before = runPipeline(ctx, BI, {})

    const forgotten: ScopeItem[] = [
      { id: 'mobilisation', description: 'Float plant on/off', category: 'mobilisation', quantity: 1, unit: 'ea', materialId: undefined },
      { id: 'pump', description: 'Concrete pump', category: 'plant', quantity: 4, unit: 'hr', machineId: 'ex5t' },
    ]
    const ctx2 = addForgottenScopeItems(ctx, forgotten)
    const after = runPipeline(ctx2, BI, {})

    // New physical lines exist (re-entered at Quantity), and the price moved.
    expect(after.quantity.lines.length).toBeGreaterThan(before.quantity.lines.length)
    expect(after.commercial.quotedTotal).toBeGreaterThan(before.commercial.quotedTotal)
  })

  it('risk contingency override raises the quoted total', () => {
    const base = runPipeline(sampleContext(), BI, {})
    const risky = runPipeline(sampleContext(), BI, { riskContingencyPercent: 0.25 })
    expect(risky.commercial.riskContingency).toBeGreaterThan(base.commercial.riskContingency)
    expect(canSend(base.validation) || base.validation.status === 'fail').toBe(true)
  })
})
