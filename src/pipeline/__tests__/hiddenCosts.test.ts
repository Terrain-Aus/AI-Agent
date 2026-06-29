import { describe, it, expect } from 'vitest'
import { quantityEngine } from '../quantityEngine'
import { suggestForgottenItems } from '../hiddenCosts'
import { addForgottenScopeItems, runPipeline } from '../index'
import { SEED_BUSINESS_INTELLIGENCE as BI } from '../seed'
import { sampleContext, findMoneyKeys } from './helpers'

describe('Hidden Cost Intelligence — forgotten items re-enter Stage 1', () => {
  const ctx = sampleContext()
  const q = quantityEngine(ctx, BI.productivity)
  const suggestions = suggestForgottenItems(ctx, q, BI)

  it('detects commonly-forgotten physical items on a dig job', () => {
    const keys = suggestions.map((s) => s.key)
    expect(keys).toContain('mobilisation')
    expect(keys).toContain('survey-setout')
    expect(keys).toContain('cartage')
  })

  it('suggestions carry NO money (physical scope items only)', () => {
    expect(findMoneyKeys(suggestions)).toEqual([])
  })

  it('accepting a suggestion re-enters Stage 1 and moves the price', () => {
    const before = runPipeline(ctx, BI, {})
    const mob = suggestions.find((s) => s.key === 'mobilisation')!
    const ctx2 = addForgottenScopeItems(ctx, [mob.item])
    const after = runPipeline(ctx2, BI, {})
    expect(after.quantity.lines.length).toBe(before.quantity.lines.length + 1)
    // Mobilisation now present, so Validation no longer warns about it.
    expect(after.validation.checks.some((c) => c.rule === 'missingMobilisation')).toBe(false)
  })
})
