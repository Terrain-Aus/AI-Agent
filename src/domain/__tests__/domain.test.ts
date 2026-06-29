import { describe, it, expect } from 'vitest'
import { seedQLD } from '../seedQLD'
import { projectRateBook } from '../rateBook'
import { resolveRate } from '../rateEngine'
import { runCommercial } from '../commercialEngine'
import { runTrade, runQuantity } from '../quantityEngine'
import { runValidation, buildFinalQuote } from '../validationEngine'
import { resolveSellPrice, resolveMargin } from '../schema'
import type { QuoteContext, RatedLine, ValidatedQuoteContext } from '../schema'

describe('Pricing primitive', () => {
  it('derives sell from cost×(1+markup), floored at minimumCharge', () => {
    expect(resolveSellPrice({ cost: 100, minimumCharge: 0, isOverridden: false }, 0.3)).toBe(130)
    expect(resolveSellPrice({ cost: 100, minimumCharge: 200, isOverridden: false }, 0.3)).toBe(200) // floor wins
  })
  it('pinned charge wins when overridden', () => {
    expect(resolveSellPrice({ cost: 100, minimumCharge: 0, isOverridden: true, pinnedCharge: 500 }, 0.3)).toBe(500)
  })
  it('margin = (sell-cost)/sell', () => {
    expect(resolveMargin(75, 100)).toBeCloseTo(0.25, 4)
    expect(resolveMargin(100, 0)).toBe(0)
  })
})

describe('projectRateBook — region resolution', () => {
  const book = projectRateBook(seedQLD)
  it('indexes every priced item across every region', () => {
    expect(book.entries.length).toBe((seedQLD.labour.length + seedQLD.plant.length + seedQLD.materials.length + seedQLD.attachments.length) * seedQLD.regions.length)
    expect(book.byItemId['ex13t'].length).toBe(2)
  })
  it('scales COST only by the region multiplier (base origin)', () => {
    const bne = book.byItemId['operator'].find((e) => e.regionId === 'brisbane')!
    const isa = book.byItemId['operator'].find((e) => e.regionId === 'mtisa')!
    expect(bne.cost).toBe(62)
    expect(isa.cost).toBe(round2(62 * 1.25))
    expect(isa.origin).toBe('base')
  })
  it('applies a regional override as a hard price', () => {
    const isaConc = book.byItemId['conc25'].find((e) => e.regionId === 'mtisa')!
    expect(isaConc.origin).toBe('regionalOverride')
    expect(isaConc.sell).toBe(520) // pinned
  })
})

describe('resolveRate — composes wet hire, fuel, float, minimum', () => {
  const book = projectRateBook(seedQLD)
  it('wet hire adds the operator and fuel', () => {
    const r = resolveRate(book, { regionId: 'brisbane', plantId: 'ex13t', hours: 8, requiresOperator: true })
    expect(r.operator?.roleId).toBe('operator')
    expect(r.fuel?.litres).toBe(18 * 8)
    expect(r.cost.subtotal).toBeGreaterThan(r.cost.base)
  })
  it('applies minimum hire hours', () => {
    const r = resolveRate(book, { regionId: 'brisbane', plantId: 'ex13t', hours: 2 })
    expect(r.appliedMinimum).toBe(true)
    expect(r.hours).toBe(4)
  })
})

function buildContext(): QuoteContext {
  const rawInput = { jobDescription: 'Bulk excavation 80m2 x 200mm, cart spoil', capturedFields: { areaM2: 80, depthMm: 200 } }
  const ctx: QuoteContext = { id: 'q1', createdAt: '2025-01-01T00:00:00.000Z', regionId: 'brisbane', rawInput }
  ctx.trade = runTrade(rawInput)
  ctx.quantities = runQuantity(ctx)
  const book = projectRateBook(seedQLD)
  const rated: RatedLine[] = [{ query: { regionId: 'brisbane', plantId: 'ex13t', hours: 6, requiresOperator: true }, result: resolveRate(book, { regionId: 'brisbane', plantId: 'ex13t', hours: 6, requiresOperator: true }) }]
  ctx.rates = rated
  ctx.risk = { confidence: 0.8, factors: [], contingencyMarkup: 0.05 }
  ctx.commercial = runCommercial(rated[0].result, seedQLD.pricingPolicy, ctx.risk)
  return ctx
}

describe('Quantity → Commercial → Validation → Final (end-to-end on seed)', () => {
  it('quantity is physical and present', () => {
    const ctx = buildContext()
    expect(ctx.quantities!.items.length).toBeGreaterThan(0)
    expect(ctx.quantities!.items[0].quantity).toBe(16) // 80×200/1000
  })
  it('commercial total exceeds cost and carries a margin', () => {
    const ctx = buildContext()
    expect(ctx.commercial!.total).toBeGreaterThan(ctx.commercial!.subtotalCost)
    expect(ctx.commercial!.achievedMargin).toBeGreaterThan(0)
  })
  it('validation gate allows a healthy quote and blocks a negative-margin one', () => {
    const ctx = buildContext()
    const v = runValidation(ctx, seedQLD.pricingPolicy)
    expect(v.decision.gate).toBe('allow')

    const broke: QuoteContext = { ...ctx, commercial: { ...ctx.commercial!, achievedMargin: -0.2 } }
    const vb = runValidation(broke, seedQLD.pricingPolicy)
    expect(vb.decision.gate).toBe('block')
    expect(vb.recommendation).toBe('block_send')
  })
  it('buildFinalQuote produces a read-only quote and flags send-against-advice', () => {
    const ctx = buildContext()
    const validation = runValidation(ctx, seedQLD.pricingPolicy)
    const validated = { ...ctx, validation } as ValidatedQuoteContext
    const final = buildFinalQuote(validated)
    expect(final.total).toBeGreaterThan(0)
    expect(final.sentAgainstAdvice).toBe(false)
  })
})

const round2 = (n: number) => Math.round(n * 100) / 100
