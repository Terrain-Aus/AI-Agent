import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { estimate, runExample, padPrepRawInput } from '../index'
import { BRISBANE_BI, MT_ISA_BI, TRUCK_CAPACITY_M3 } from '../seed'

const q = () => runExample('mtisa-earthworks')

// Keys that would indicate money leaked into the dollar-free quantities.
const MONEY = ['cost', 'charge', 'price', 'sell', 'rate', 'dollar', '$', 'margin']
const moneyKeys = (o: unknown): string[] => {
  const hits: string[] = []
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (MONEY.some((m) => k.toLowerCase().includes(m))) hits.push(k)
    hits.push(...moneyKeys(v))
  }
  return hits
}

describe('LAW 1 — Quantity Engine never produces dollars', () => {
  it('quantities object carries no monetary field', () => {
    expect(moneyKeys(q().quantities)).toEqual([])
  })
})

describe('LAW 2 — BANK vs LOOSE', () => {
  it('dig hours come from BANK volume; loads from LOOSE volume', () => {
    const Q = q().quantities
    expect(Q.cutVolumeBankM3).toBe(120) // 200 × 0.6
    expect(Q.spoilLooseM3).toBe(Math.round(120 * 1.32 * 100) / 100) // clay swell
    expect(Q.spoilLooseM3!).toBeGreaterThan(Q.cutVolumeBankM3!)
    // loads derived from LOOSE, rounded UP
    expect(Q.truckLoads).toBe(Math.ceil(Q.spoilLooseM3! / TRUCK_CAPACITY_M3))
    // loads must NOT equal bank-derived loads
    expect(Q.truckLoads).not.toBe(Math.ceil(Q.cutVolumeBankM3! / TRUCK_CAPACITY_M3))
  })
})

describe('LAW 3 — only Rate creates base money, and it is a callable service', () => {
  it('Quantity has no money; Rate produces the priced lines; Hidden Cost prices via Rate', () => {
    const quote = q()
    expect(quote.rated).toBeDefined()
    expect(quote.rated!.lines.length).toBeGreaterThan(0)
    // hidden-cost items are priced (have cost/charge) — i.e. Rate priced them
    const mob = quote.rated!.lines.find((l) => /mobilisation/i.test(l.item))
    expect(mob).toBeDefined()
    expect(mob!.charge).toBeGreaterThan(0)
  })
})

describe('LAW 4 — Commercial never looks up a rate', () => {
  it('commercial.ts imports no rate/repository/BI source', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/estimator/commercial.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(src).not.toMatch(/from ['"]\.\/rate['"]|makeRateService|RateService|repository|seed/)
  })
})

describe('LAW 5 — margin model', () => {
  it('labour/plant carry their own sell; materials/subbies marked up; margin used for guardrail', () => {
    const c = q().commercial!
    // materials are NOT zero-margin: sell > cost
    expect(c.materialSell).toBeGreaterThan(c.materialCost)
    expect(c.subbieSell).toBeGreaterThan(c.subbieCost)
    // labour/plant not blanket-margined again (their charge already includes sell)
    expect(c.labourCharge).toBeGreaterThan(0)
    expect(c.plantCharge).toBeGreaterThan(0)
    // realised margin is profit/price
    expect(c.realisedMargin).toBeCloseTo((c.sellTotal - c.costTotal) / c.sellTotal, 4)
  })
})

describe('LAW 6 — Validation can BLOCK send', () => {
  it('low-confidence fixed-price job is blocked and not sendable', () => {
    const quote = q()
    expect(quote.validation!.blockSend).toBe(true)
    expect(quote.validation!.status).toBe('BLOCK')
    expect(quote.clientQuote!.sendable).toBe(false)
    expect(quote.clientQuote!.price).toBeNull()
    expect(quote.validation!.recommendation.toLowerCase()).toContain('site visit')
  })
})

describe('LAW 7 — every engine appends an audit row; added items record a trigger', () => {
  it('audit covers all engines and every rated line has a trigger', () => {
    const quote = q()
    const engines = new Set(quote.engineAudit.map((a) => a.engine))
    for (const e of ['Trade', 'Quantity', 'Rate', 'HiddenCost', 'Risk', 'Commercial', 'Validation', 'FinalQuote']) {
      expect(engines.has(e)).toBe(true)
    }
    for (const line of quote.rated!.lines) expect(line.trigger.length).toBeGreaterThan(0)
    for (const h of quote.hiddenCosts) expect(h.trigger.length).toBeGreaterThan(0)
  })
})

describe('ACCEPTANCE', () => {
  it('pad_prep runs end-to-end → client quote + internal sheet + validation', () => {
    const quote = q()
    expect(quote.clientQuote).toBeDefined()
    expect(quote.internalSheet).toBeDefined()
    expect(quote.validation).toBeDefined()
    expect(quote.internalSheet!.totalIncGst).toBeGreaterThan(0)
  })

  it('swapping the BI profile changes every dollar with no engine change', () => {
    const raw = padPrepRawInput()
    const bne = estimate(raw, BRISBANE_BI)
    const isa = estimate(raw, MT_ISA_BI)
    expect(isa.internalSheet!.costTotal).not.toBe(bne.internalSheet!.costTotal)
    expect(isa.internalSheet!.sellTotal).not.toBe(bne.internalSheet!.sellTotal)
    // same physical quantities (engine logic identical), different money
    expect(isa.quantities.cutVolumeBankM3).toBe(bne.quantities.cutVolumeBankM3)
  })

  it('low-confidence assumed-access job → BLOCK + site-visit recommendation', () => {
    const quote = q()
    expect(quote.confidence!).toBeLessThan(MT_ISA_BI.pricingPolicy.allowFixedPriceBelowConfidence)
    expect(quote.validation!.findings.some((f) => f.check === 'fixedPriceConfidence' && f.severity === 'block')).toBe(true)
  })
})
